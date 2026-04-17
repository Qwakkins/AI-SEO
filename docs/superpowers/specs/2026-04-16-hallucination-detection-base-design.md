# Hallucination Detection Base — Design Spec

## Context

The GEO Tracker scans AI platforms (ChatGPT, Claude) to check if they mention a local business. Currently it only tracks presence/absence — not whether the information AI provides is correct. No competitor in this space does factual accuracy checking. This feature is the tool's core differentiator.

This spec covers the MVP base: ground truth storage, regex-based fact extraction, exact+fuzzy matching, and UI for data entry and flag display. LLM-as-judge and advanced extraction are intentionally deferred — this base is designed to be extended later.

## Scope

**In scope:**
- Ground truth table and CRUD API
- Ground truth entry form on business detail page
- Fact extraction from AI responses (regex-based)
- Exact + fuzzy matching engine
- Hallucination flags table and storage
- Flag display on business detail page
- Integration into scan pipeline (manual + cron)

**Out of scope (future):**
- LLM-as-judge for ambiguous claims
- Hours, pricing, service area, owner name fields
- Hallucination trend charts
- Email/notification alerts for new hallucinations
- Re-running detection on historical results (architecture supports it, UI deferred)

## Database

### Table: `business_ground_truth`

```sql
CREATE TABLE business_ground_truth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone text,
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  website_url text,
  services text[] DEFAULT '{}',
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id)
);
```

One row per business. All fields nullable — a business may not have a phone or website. `verified_at` is set when the user saves/updates the form, indicating the facts are current as of that date.

### Table: `hallucination_flags`

```sql
CREATE TABLE hallucination_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_result_id uuid NOT NULL REFERENCES query_results(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  field text NOT NULL,
  ai_claim text NOT NULL,
  ground_truth_value text,
  flag_type text NOT NULL CHECK (flag_type IN ('incorrect', 'unverifiable', 'not_mentioned')),
  confidence numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hallucination_flags_business ON hallucination_flags(business_id);
CREATE INDEX idx_hallucination_flags_result ON hallucination_flags(query_result_id);
```

One row per detected issue. `field` is one of: "phone", "address", "website", "services". `flag_type` meanings:
- `incorrect` — AI stated a fact that contradicts ground truth
- `unverifiable` — AI stated a fact but no ground truth exists for that field
- `not_mentioned` — ground truth exists but AI didn't mention this field (informational)

`confidence` is 0-1 where 1.0 = definite mismatch, lower values = fuzzy match uncertainty.

## Fact Extraction

**File:** `src/lib/scanner/fact-extractor.ts`

Extracts factual claims from an AI response about a business. Returns:

```typescript
interface ExtractedFacts {
  phones: string[];
  addresses: string[];
  websites: string[];
  services: string[];
}
```

**Extraction strategy (regex-based):**

- **Phones:** Match `(xxx) xxx-xxxx`, `xxx-xxx-xxxx`, `xxx.xxx.xxxx`, `+1xxxxxxxxxx`. Normalize all to digits-only for comparison.
- **Addresses:** Match `[number] [word(s)] [St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Way|Ct|Court|Pl|Place]`. Extract the full match.
- **Websites:** Match URLs (`https?://...`) and bare domains (`word.com`, `word.net`, `word.org`). Normalize: strip protocol, www, trailing slash.
- **Services:** Extract items from list patterns:
  - Bullet/numbered lists: `- service name` or `1. service name`
  - Comma-separated: "they offer X, Y, and Z"
  - "known for" / "specializes in" / "offers" patterns

This is intentionally conservative — it extracts formatted, structured claims rather than trying to understand prose. Missing some claims is acceptable; false extraction is not.

## Matching Engine

**File:** `src/lib/scanner/hallucination-detector.ts`

Compares extracted facts against ground truth.

### Phone matching
1. Strip both to digits only
2. If ground truth phone has 10 digits and extracted has 11 starting with "1", strip the leading "1"
3. Exact match on digits. Phone numbers are unambiguous — partial matches are wrong numbers.

### Address matching
1. Lowercase both
2. Expand abbreviations: St→Street, Ave→Avenue, Blvd→Boulevard, Dr→Drive, Rd→Road, Ln→Lane
3. Levenshtein distance between normalized strings
4. Distance ≤ 3: match (handles minor typos). Distance > 3: flag as incorrect.

### Website matching
1. Extract domain from both (strip protocol, www, path, trailing slash)
2. Exact match on domain. `philsbbq.net` matches `https://www.philsbbq.net/menu`.

### Services matching
1. Lowercase both lists
2. For each AI-claimed service, check if any ground truth service is a substring (or vice versa)
3. "BBQ ribs" matches "ribs". "catering" matches "catering services".
4. Unmatched AI claims → flag as potentially incorrect with confidence 0.7 (fuzzy, not certain)

### Output
For each comparison, produce a flag or nothing:
- Match found → no flag (fact is correct)
- Mismatch, ground truth exists → `{ flag_type: "incorrect", confidence: based on distance }`
- AI states a fact, no ground truth for that field → `{ flag_type: "unverifiable", confidence: 1.0 }`
- Ground truth exists, AI didn't mention it → `{ flag_type: "not_mentioned", confidence: 1.0 }`

## Pipeline Integration

**Modified files:**
- `src/app/api/scan/route.ts` — call `detectHallucinations()` after `aggregateVisibilityScores()`
- `src/app/api/cron/scan/route.ts` — same, inside the per-business loop

**Flow:**
1. `scanBusiness(businessId)` runs (existing, unchanged)
2. `aggregateVisibilityScores(businessId, results)` runs (existing, unchanged)
3. `detectHallucinations(businessId, results)` runs (new):
   a. Load ground truth from `business_ground_truth` for this business
   b. If no ground truth exists, skip (no flags to generate)
   c. For each new scan result, delete any existing flags with the same `query_result_id` (avoid duplicates on re-scan). Do NOT delete flags from prior scan dates — those are historical.
   d. For each result where `business_mentioned === true`:
      - Run `extractFacts(result.response)` to get claimed facts
      - Run `matchFacts(extractedFacts, groundTruth)` to compare
      - Insert flags into `hallucination_flags`

## API Routes

### `GET /api/ground-truth/[businessId]`
Returns the ground truth record for a business, or empty object if none exists.

### `POST /api/ground-truth/[businessId]`
Upserts ground truth. Body: `{ phone, address_street, address_city, address_state, address_zip, website_url, services }`. Sets `verified_at` to now. Requires editor role.

### `GET /api/hallucinations/[businessId]`
Returns all hallucination flags for a business, joined with query_result data (platform, query, date). Used by the UI.

## UI: Ground Truth Form

**Location:** New section on `src/app/business/[id]/page.tsx`, below the "Tracking Queries" section and above "Scan Results."

**Design:**
- Section header: "Business Facts" with subtext "Enter verified information to detect AI hallucinations"
- Form fields: phone (text input), address (4 inputs: street, city, state as dropdown, zip), website (text input), services (comma-separated text input with helper text)
- Save button. Shows "Last verified: [relative date]" when data exists.
- Dark mode: `bg-[#161616]` card, `border-gray-700`, dark inputs matching `/add` page style.

## UI: Hallucination Flags Display

**Location:** New section on `src/app/business/[id]/page.tsx`, between "AI Visibility Summary" and "Scan Results."

**Design:**
- Section header: "Fact Check" with summary line: "X incorrect facts found across Y responses"
- If no ground truth exists: show prompt "Add business facts above to enable hallucination detection"
- If ground truth exists but no flags: show "No hallucinations detected" in green
- Flag cards, each showing:
  - Field name (e.g., "Phone")
  - What AI said (e.g., "(619) 555-1234")
  - What's correct (e.g., "(619) 226-6333")
  - Platform and query that triggered it
  - Color: red border for "incorrect", yellow for "unverifiable", gray for "not_mentioned"
- Dark mode styling consistent with rest of app.

## Files to Create

```
src/lib/scanner/fact-extractor.ts      — extractFacts() function
src/lib/scanner/hallucination-detector.ts — detectHallucinations() + matchFacts()
src/app/api/ground-truth/[businessId]/route.ts — GET/POST ground truth
src/app/api/hallucinations/[businessId]/route.ts — GET hallucination flags
supabase/005_ground_truth.sql          — business_ground_truth table
supabase/006_hallucination_flags.sql   — hallucination_flags table
```

## Files to Modify

```
src/app/api/scan/route.ts             — add detectHallucinations() call
src/app/api/cron/scan/route.ts        — add detectHallucinations() call
src/app/business/[id]/page.tsx        — add ground truth form + flag display
```

## Verification

1. Add ground truth for Phil's BBQ (phone, address, website, services)
2. Run a scan
3. Check if hallucination flags appear for any incorrect facts
4. Intentionally enter a wrong phone number in ground truth
5. Re-scan — verify it flags the "correct" AI response as incorrect (proving the matching works)
6. Remove ground truth and scan — verify no flags are generated (graceful skip)
7. Check cron route still works with hallucination detection added
