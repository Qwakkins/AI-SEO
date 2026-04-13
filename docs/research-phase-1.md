# Research Phase 1: GEO Scanner Evolution

> Generated: 2026-04-12 | Iteration 1
> Status: Draft

---

## Table of Contents

1. [Hallucination Detection Design](#1-hallucination-detection-design)
2. [Minimum Digital Presence Requirements](#2-minimum-digital-presence-requirements)
3. [Clerk Auth Integration](#3-clerk-auth-integration)
4. [Automated Scanning via Vercel Cron](#4-automated-scanning-via-vercel-cron)
5. [Improved Mention Detection](#5-improved-mention-detection)
6. [Scanning Prompt Engineering](#6-scanning-prompt-engineering)
7. [API Cost Modeling](#7-api-cost-modeling)
8. [Trend Tracking and Dashboard Enhancements](#8-trend-tracking-and-dashboard-enhancements)
9. [Competitor Teardown](#9-competitor-teardown)
10. [Feasibility and Differentiation Matrix](#10-feasibility-and-differentiation-matrix)
11. [Prioritized Build Order](#11-prioritized-build-order)
12. [Updated File Structure](#12-updated-file-structure)
13. [Risk Register](#13-risk-register)

---

## 1. Hallucination Detection Design

### Current State

The existing analyzer at `src/lib/scanner/analyzer.ts` exports `analyzeResponse()` which only performs mention detection via exact string matching (`lowerResponse.indexOf(lowerName)`). It returns an `AnalysisResult` with `business_mentioned`, `mention_context`, `position_in_response`, and `competitors_mentioned`. There is zero hallucination detection today.

### Ground Truth Data Model

Each business needs verified facts stored against which AI responses can be compared. Design a `business_ground_truth` table keyed to the existing `businesses.id`.

**Fields and matching strategies:**

| Field | Type | Match Strategy | Rationale |
|-------|------|----------------|-----------|
| `phone` | text | Exact (normalized) | Phone numbers are unambiguous. Normalize to E.164 before comparing. |
| `address_street` | text | Fuzzy (Levenshtein + abbreviation expansion) | "123 Main St" vs "123 Main Street" — expand abbreviations then fuzzy match. |
| `address_city` | text | Exact (case-insensitive) | City names are standardized. |
| `address_state` | text | Exact | Two-letter state codes. |
| `address_zip` | text | Exact | ZIP codes are unambiguous. |
| `hours_json` | jsonb | Structured comparison | Compare day-by-day. Flag if AI says "open Sunday" but ground truth says closed. |
| `website_url` | text | Domain match | Compare domain only — ignore protocol, www prefix, trailing slashes. |
| `services` | text[] | Fuzzy set overlap | Normalize to lowercase, check for substring overlap. If AI claims business offers a service not in the list, flag as potential hallucination. |
| `service_area` | text[] | Fuzzy set overlap | List of cities/neighborhoods served. |
| `year_established` | integer | Exact | Year is unambiguous. |
| `owner_name` | text | Fuzzy | Names can have variations. |
| `license_numbers` | text[] | Exact | License/certification numbers are precise. |
| `pricing_notes` | text | LLM-as-judge | Pricing is contextual — "affordable" vs "$50/load" requires judgment. |
| `specialties` | text[] | Fuzzy set overlap | Similar to services but more specific. |
| `verified_at` | timestamptz | N/A | When the ground truth was last verified by the business owner. |
| `verified_by` | text | N/A | Who verified — "owner", "admin", "auto". |

**Decision: Three-tier matching approach.**
1. **Exact match fields** (phone, zip, state, year, licenses): Direct string comparison after normalization. Binary correct/incorrect.
2. **Fuzzy match fields** (address, name, services, service area): Use Levenshtein distance with a threshold (<=2 edits for short strings, <=20% of string length for longer). Score as `match` / `partial_match` / `no_match`.
3. **LLM-as-judge fields** (pricing, subjective claims): Send the AI response + ground truth to a cheap model (gpt-4o-mini) with a structured prompt asking: "Is this claim consistent with the ground truth? Reply with: CONSISTENT, INCONSISTENT, UNVERIFIABLE, or SUBJECTIVE."

### Handling Subjective Claims

Claims like "best in the city" or "most affordable" are **not hallucinations** — they're subjective. The system should:
- Tag these as `subjective` rather than `hallucination` or `accurate`
- Not count them in accuracy scores
- Surface them in the UI under a separate "Subjective Claims" section so the business owner can see how AI characterizes them

**Implementation:** Use keyword detection for superlatives ("best", "top", "leading", "most", "cheapest", "fastest") and flag the containing sentence for LLM-as-judge review only if it also contains a factual claim.

### Handling Outdated vs. Wrong Information

Distinguish via `verified_at` timestamp:
- If ground truth was verified recently (within 90 days) and AI contradicts it: **hallucination**
- If ground truth is stale (>90 days) and AI contradicts it: **possibly outdated** — flag for re-verification
- If AI provides info with no ground truth entry: **unverifiable** — prompt the business owner to confirm or deny

### Accuracy Expectations by Field Type

| Field Type | Expected Accuracy | Notes |
|------------|-------------------|-------|
| Phone | 60-70% | AI often fabricates phone numbers for local businesses |
| Address | 70-80% | Usually correct if business has Google Business Profile |
| Hours | 40-50% | Frequently hallucinated, especially for small businesses |
| Services | 50-60% | AI infers services from category, often incorrectly |
| Pricing | 20-30% | Almost always fabricated for local businesses |
| Service area | 60-70% | Usually correct at city level, wrong at neighborhood level |

### Database Changes

```sql
-- Ground truth facts for hallucination detection
CREATE TABLE business_ground_truth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone text,
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  hours_json jsonb,        -- {"monday": {"open": "08:00", "close": "17:00"}, ...}
  website_url text,
  services text[],
  service_area text[],
  year_established integer,
  owner_name text,
  license_numbers text[],
  pricing_notes text,
  specialties text[],
  verified_at timestamptz DEFAULT now(),
  verified_by text DEFAULT 'admin',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id)
);

CREATE INDEX idx_ground_truth_business ON business_ground_truth(business_id);

-- Hallucination flags linked to query results
CREATE TABLE hallucination_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_result_id uuid NOT NULL REFERENCES query_results(id) ON DELETE CASCADE,
  field_name text NOT NULL,          -- 'phone', 'address', 'services', etc.
  ai_value text NOT NULL,            -- what the AI said
  ground_truth_value text,           -- what the verified truth is (null if unverifiable)
  flag_type text NOT NULL,           -- 'hallucination', 'outdated', 'unverifiable', 'subjective', 'accurate'
  confidence numeric NOT NULL,       -- 0.0 to 1.0 confidence in the flag
  match_method text NOT NULL,        -- 'exact', 'fuzzy', 'llm_judge'
  llm_judge_reasoning text,          -- explanation from LLM-as-judge if used
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hallucination_flags_result ON hallucination_flags(query_result_id);
CREATE INDEX idx_hallucination_flags_type ON hallucination_flags(flag_type);
CREATE INDEX idx_hallucination_flags_field ON hallucination_flags(field_name);
```

### New Files Needed

- `src/lib/scanner/hallucination-detector.ts` — Core detection logic with the three-tier matching approach
- `src/lib/scanner/fact-extractor.ts` — Extracts factual claims from AI responses (phone, address, hours, etc.) using regex + LLM fallback
- `src/lib/scanner/llm-judge.ts` — Sends claims to gpt-4o-mini for CONSISTENT/INCONSISTENT/UNVERIFIABLE/SUBJECTIVE verdicts
- `src/app/api/ground-truth/route.ts` — CRUD API for managing ground truth per business
- `src/app/business/[id]/ground-truth/page.tsx` — UI form for entering/editing ground truth

### Dashboard Integration

In the existing `src/app/business/[id]/page.tsx`:
- Add a "Hallucination Alerts" section above the results table showing flagged issues grouped by severity
- Color coding: red for confirmed hallucinations, orange for possibly outdated, gray for unverifiable, blue for subjective
- Add a hallucination count badge to each business card on the dashboard (`src/app/page.tsx`)
- In the expanded result view (already has `expandedResult` state), show per-claim flags inline next to the AI response text

---

## 2. Minimum Digital Presence Requirements

### What AI Models Need to "Know" a Business

Based on how LLMs are trained and how retrieval-augmented models (Perplexity, ChatGPT with browsing) source information:

**Tier 1 — Essential (must have to appear in any AI response):**
1. **Google Business Profile (GBP)** — The single most important signal. GBP data feeds Google's Knowledge Graph, which is a primary training/retrieval source for all major LLMs. Without GBP, a local business is effectively invisible to AI.
2. **A live website with structured data** — Schema.org LocalBusiness markup gives AI models machine-readable facts. Without it, AI has to infer from unstructured text.
3. **NAP consistency** — Name, Address, Phone must be identical across all listings. Inconsistency causes AI models to distrust or ignore the business.

**Tier 2 — Important (significantly increases visibility):**
4. **Yelp listing** — Yelp is heavily crawled and commonly cited by AI models, especially for service businesses.
5. **Industry-specific directories** — For hauling: HomeAdvisor, Angi, Thumbtack. For sign makers: ThomasNet, industry associations.
6. **5+ Google Reviews** — Reviews provide the natural language context AI models use to describe businesses. Businesses with <5 reviews are rarely mentioned.
7. **Social media profiles** — At minimum, a Facebook business page. AI models index social profiles for supplementary information.

**Tier 3 — Helpful (increases richness of AI responses):**
8. **Local news/press mentions** — Third-party mentions in articles give AI models confidence to recommend a business.
9. **BBB listing** — Signals legitimacy, especially for service businesses.
10. **Active blog/content on website** — Provides AI with more natural language context about services and expertise.

### Zero-Presence Remediation Playbook (for the hauling client)

This is the step-by-step order of operations for a business with zero digital presence:

| Step | Action | Timeline | Cost | Impact on AI Visibility |
|------|--------|----------|------|------------------------|
| 1 | Register LLC / business entity | Week 1 | $50-150 | Prerequisite for everything else |
| 2 | Create Google Business Profile | Week 1 | Free | **Critical** — this alone can make business appear in AI |
| 3 | Build basic website with LocalBusiness schema markup | Week 2-3 | $0-500 | High — gives AI structured facts |
| 4 | Submit to Yelp, BBB, Yellow Pages | Week 3 | Free-$50 | Medium — builds citation network |
| 5 | Create Facebook business page | Week 3 | Free | Medium — supplementary signal |
| 6 | Submit to industry directories (HomeAdvisor, Angi, Thumbtack) | Week 4 | Free-$30/mo | Medium-High for service businesses |
| 7 | Solicit 5-10 Google Reviews from past customers | Week 4-6 | Free | **High** — reviews are the #1 natural language signal |
| 8 | Create basic content (service pages, FAQ, about page) | Week 4-8 | Included in website | Medium — more context for AI to work with |
| 9 | Get listed in local Chamber of Commerce | Week 6 | $100-500/yr | Low-Medium — authority signal |
| 10 | Seek local press/blog mention | Week 8+ | Free-$200 | Medium — third-party validation |

### Schema Markup That Matters Most

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Business Name",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "City",
    "addressRegion": "ST",
    "postalCode": "12345"
  },
  "telephone": "+1-555-123-4567",
  "openingHoursSpecification": [...],
  "areaServed": [...],
  "serviceType": [...],
  "priceRange": "$$",
  "aggregateRating": {...}
}
```

Key schema types by business category:
- Service businesses (hauling): `HomeAndConstructionBusiness` or `ProfessionalService` with `areaServed` and `serviceType`
- B2B (sign makers): `LocalBusiness` with `makesOffer` and `serviceType`

### Timeline to AI Visibility

- **Perplexity/ChatGPT with browsing**: 2-4 weeks after GBP + website are live (these use real-time web search)
- **Claude/GPT-4 (non-browsing)**: 3-12 months (depends on training data refresh cycles)
- **Gemini**: 2-6 weeks (tight integration with Google's index)

**Key insight for the tool owner:** The tool should differentiate between search-augmented AI (Perplexity, ChatGPT browsing) and training-data-only AI (base Claude, base GPT). Visibility in search-augmented AI is achievable quickly; visibility in base models takes months and is partially outside the business's control.

### Database Changes

```sql
-- Add digital presence tracking to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS digital_presence jsonb DEFAULT '{}';
-- Example: {"gbp": true, "website": true, "yelp": false, "schema_markup": true, "review_count": 12}

-- Remediation checklist per business
CREATE TABLE remediation_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_key text NOT NULL,              -- 'gbp', 'website', 'yelp', 'schema_markup', 'reviews_5plus', etc.
  item_label text NOT NULL,            -- Human-readable label
  status text NOT NULL DEFAULT 'todo', -- 'todo', 'in_progress', 'done', 'skipped'
  priority integer NOT NULL,           -- 1 = highest priority
  notes text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, item_key)
);

CREATE INDEX idx_remediation_business ON remediation_checklist(business_id);
```

### New Files Needed

- `src/lib/remediation/checklist-template.ts` — Default checklist items by business category
- `src/app/business/[id]/remediation/page.tsx` — Checklist UI for tracking digital presence improvements
- `src/app/api/remediation/route.ts` — CRUD API for checklist items

---

## 3. Clerk Auth Integration

### Design Decisions

**Why Clerk:** Free tier supports 10,000 MAU, built-in Next.js App Router middleware, handles the entire auth flow (sign-up, sign-in, password reset, social login). No need to build auth from scratch.

**Multi-tenant model:** The tool owner (admin) sees all businesses. Client users see only their assigned businesses. This maps cleanly to Clerk's metadata + a join table.

### User-Business Linking

Clerk stores users externally. Link to Supabase via Clerk's `userId` string.

```sql
-- Link Clerk users to businesses they can access
CREATE TABLE user_business_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,        -- Clerk's user ID (e.g., "user_2abc123")
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer', -- 'admin', 'editor', 'viewer'
  created_at timestamptz DEFAULT now(),
  UNIQUE(clerk_user_id, business_id)
);

CREATE INDEX idx_user_access_clerk ON user_business_access(clerk_user_id);
CREATE INDEX idx_user_access_business ON user_business_access(business_id);
```

### Role Design

| Role | Can See | Can Scan | Can Edit Ground Truth | Can Manage Users |
|------|---------|----------|----------------------|-----------------|
| `admin` | All businesses | Yes | Yes | Yes |
| `editor` | Assigned businesses | Yes | Yes | No |
| `viewer` | Assigned businesses | No | No | No |

**Admin identification:** Store admin user IDs in Clerk's organization metadata or simply check against an environment variable `ADMIN_CLERK_IDS` (comma-separated) for the MVP. The tool owner is the only admin initially.

### Auth Protection Map

| Route | Auth Required | Role Required |
|-------|--------------|--------------|
| `/` (dashboard) | Yes | Any (filtered by access) |
| `/business/[id]` | Yes | Access to that business |
| `/business/[id]/ground-truth` | Yes | Editor+ for that business |
| `/add` | Yes | Admin |
| `/api/scan` | Yes | Editor+ for that business |
| `/api/businesses` | Yes | Any (filtered by access) |
| `/api/businesses/[id]` | Yes | Access to that business |
| `/api/ground-truth` | Yes | Editor+ for that business |
| `/api/cron/scan` | API key auth (Vercel cron secret) | N/A |

### Middleware Setup

Use Clerk's Next.js middleware to protect all routes except the sign-in page:

```typescript
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
};
```

### Onboarding Flow for New Client Users

1. Admin creates business in the tool and invites client by email
2. Client clicks invite link, lands on Clerk sign-up page
3. After sign-up, Clerk webhook fires to our `/api/webhooks/clerk` endpoint
4. Webhook creates the `user_business_access` row linking the new user to their business
5. Client is redirected to their business dashboard (filtered to show only their business)

**Alternative (simpler for MVP):** Admin manually adds the Clerk user ID to `user_business_access` after the client signs up. Skip webhooks for now.

### New Files Needed

- `src/middleware.ts` — Clerk middleware for route protection
- `src/app/sign-in/[[...sign-in]]/page.tsx` — Clerk sign-in page
- `src/app/sign-up/[[...sign-up]]/page.tsx` — Clerk sign-up page
- `src/lib/auth.ts` — Helper to check user access to a business
- `src/app/api/webhooks/clerk/route.ts` — Webhook endpoint for user creation (phase 2)

### Package Addition

```
npm install @clerk/nextjs
```

Environment variables needed:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `ADMIN_CLERK_IDS` (comma-separated admin user IDs)

---

## 4. Automated Scanning via Vercel Cron

### Design

Vercel cron jobs call an API route on a schedule. The cron route scans all active businesses in sequence, with error isolation per business.

### Cron Configuration

In `vercel.json` (or `vercel.ts`):

```json
{
  "crons": [
    {
      "path": "/api/cron/scan",
      "schedule": "0 6 * * 1"
    }
  ]
}
```

This runs every Monday at 6:00 AM UTC (weekly).

**Frequency recommendation:**
- **Weekly** is the right default. AI model responses don't change hour-to-hour — they're based on training data and retrieval indices that update on longer cycles.
- **Daily** is wasteful for most local businesses and expensive (see cost modeling in section 7).
- **Configurable per client** is a phase 2 feature. For MVP, all businesses scan on the same weekly schedule.

### Cron Route Design

The existing `scanBusiness()` in `src/lib/scanner/index.ts` already handles scanning a single business. The cron route wraps it to scan all active businesses.

```typescript
// src/app/api/cron/scan/route.ts
import { getSupabase } from "@/lib/supabase";
import { scanBusiness } from "@/lib/scanner";

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: "DB not configured" }, { status: 500 });

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name")
    .order("created_at");

  if (!businesses?.length) {
    return Response.json({ message: "No businesses to scan" });
  }

  const results = [];
  for (const biz of businesses) {
    try {
      const scanResults = await scanBusiness(biz.id);
      // After scanning, aggregate into visibility_scores
      await aggregateVisibilityScores(biz.id, scanResults);
      results.push({ business: biz.name, status: "ok", queries: scanResults.length });
    } catch (err) {
      results.push({ business: biz.name, status: "error", error: String(err) });
      // Continue scanning other businesses — don't let one failure stop the batch
    }
  }

  // Log scan cycle
  await supabase.from("scan_logs").insert({
    scan_type: "cron_weekly",
    businesses_scanned: results.filter(r => r.status === "ok").length,
    businesses_failed: results.filter(r => r.status === "error").length,
    details: results,
  });

  return Response.json({ scanned: results.length, results });
}
```

### Visibility Score Aggregation

The existing `visibility_scores` table has columns `period_start`, `period_end`, `total_queries`, `times_mentioned`, `mention_rate`, `avg_position`. Currently never populated. The aggregation function computes these from `query_results` after each scan cycle:

```typescript
async function aggregateVisibilityScores(businessId: string, scanResults: ScanResult[]) {
  const supabase = getSupabase()!;
  const now = new Date();
  const periodStart = now.toISOString().split("T")[0];
  const periodEnd = periodStart; // Single-day period for each scan

  // Group by platform
  const byPlatform = new Map<string, { total: number; mentioned: number; positions: number[] }>();

  for (const r of scanResults) {
    if (!byPlatform.has(r.platform)) {
      byPlatform.set(r.platform, { total: 0, mentioned: 0, positions: [] });
    }
    const stats = byPlatform.get(r.platform)!;
    stats.total++;
    if (r.business_mentioned) {
      stats.mentioned++;
      if (r.position_in_response) stats.positions.push(r.position_in_response);
    }
  }

  for (const [platform, stats] of byPlatform) {
    const avgPosition = stats.positions.length > 0
      ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length
      : null;

    await supabase.from("visibility_scores").insert({
      business_id: businessId,
      platform,
      period_start: periodStart,
      period_end: periodEnd,
      total_queries: stats.total,
      times_mentioned: stats.mentioned,
      mention_rate: stats.total > 0 ? stats.mentioned / stats.total : 0,
      avg_position: avgPosition,
    });
  }
}
```

### Rate Limiting Strategy

The current `scanBusiness()` in `src/lib/scanner/index.ts` runs queries sequentially (nested `for` loops over queries and platforms), which naturally rate-limits. For multiple businesses:

- Process businesses sequentially (not in parallel) — the cron function has a 300s timeout on Vercel
- Add a 1-second delay between businesses to avoid API burst limits
- For OpenAI: rate limit is 500 RPM on tier 1 — with 3-5 queries per business and 10 businesses, we'd make ~40-50 calls, well within limits
- For Anthropic: rate limit is 50 RPM on the free tier — this is the bottleneck. Add 1.5s delay between Claude calls specifically

### Error Handling

- Each business scan is wrapped in try/catch — one failure doesn't stop the batch
- Failed businesses are logged to `scan_logs` with error details
- Consider adding retry logic (1 retry with exponential backoff) for transient API errors
- If all businesses fail (API key expired, etc.), the scan log captures it for debugging

### Database Changes

```sql
-- Scan cycle logs for auditing and debugging
CREATE TABLE scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type text NOT NULL,              -- 'cron_weekly', 'manual', 'cron_daily'
  businesses_scanned integer NOT NULL,
  businesses_failed integer NOT NULL,
  details jsonb,                        -- per-business results
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_scan_logs_created ON scan_logs(created_at);
```

### New Files Needed

- `src/app/api/cron/scan/route.ts` — Cron endpoint
- `src/lib/scanner/aggregator.ts` — Visibility score aggregation logic (extracted so manual scans can also use it)

---

## 5. Improved Mention Detection

### Current Limitations

The existing `analyzeResponse()` in `src/lib/scanner/analyzer.ts` has these issues:

1. **Exact match only**: `lowerResponse.indexOf(lowerName)` misses "Joe's Hauling" when AI writes "Joes Hauling" (no apostrophe), "Joe's Hauling & Demolition" (partial name), or "Joe Hauling" (typo).
2. **No confidence scoring**: It's binary — mentioned or not. No distinction between "definitely mentioned" and "might be a partial match."
3. **Weak competitor extraction**: Regex patterns (`**Bold**`, `1. Numbered`, `- Bulleted`) are markdown-specific. Many AI responses use plain text or inconsistent formatting.
4. **Single mention only**: `break` after finding the first sentence means we miss if the business is mentioned multiple times.

### Improved Design

Replace the current binary detection with a confidence-scored, multi-strategy approach:

```typescript
// src/lib/scanner/analyzer.ts — enhanced interface
export interface AnalysisResult {
  business_mentioned: boolean;
  mention_confidence: number;          // 0.0 to 1.0 NEW
  mention_type: 'exact' | 'fuzzy' | 'partial' | 'none';  // NEW
  mention_context: string | null;
  all_mention_contexts: string[];      // NEW — all sentences mentioning the business
  position_in_response: number | null;
  competitors_mentioned: CompetitorMention[];  // CHANGED — richer type
}

export interface CompetitorMention {    // NEW
  name: string;
  context: string;                     // sentence containing the mention
  position: number;
}
```

**Strategy 1: Exact match (confidence 1.0)**
Keep the existing `indexOf` check. If it matches, confidence is 1.0.

**Strategy 2: Normalized match (confidence 0.95)**
Before matching, normalize both the business name and response:
- Remove apostrophes, hyphens, extra spaces
- Expand abbreviations ("St" -> "Street", "Co" -> "Company")
- Remove common suffixes ("LLC", "Inc", "Co.")

If normalized match succeeds but exact didn't, confidence is 0.95.

**Strategy 3: Token overlap match (confidence 0.7-0.9)**
Split business name into tokens. If 80%+ of tokens appear within a 10-word window in the response, it's a likely match. Confidence scales with overlap percentage.

Example: "ABC Signs & Graphics" — if response contains "ABC Signs" (2/3 tokens = 67%), confidence is 0.67. If it contains "ABC Signs and Graphics" (3/3 = 100%), confidence is 0.9.

**Strategy 4: Levenshtein fuzzy match (confidence 0.6-0.8)**
Slide a window the size of the business name across the response. Compute Levenshtein distance for each window. If distance / name length < 0.2 (less than 20% edits), it's a fuzzy match.

**Should mention detection use an LLM call?**

**Decision: No, not for mention detection.** LLM calls for every response would be expensive and slow. The four-strategy approach above handles 95%+ of cases. Reserve LLM calls for hallucination detection (section 1) where accuracy matters more and the volume is lower.

Exception: If all four strategies return `none` but the response appears to describe a business matching the category and location, offer an optional "deep analysis" button that sends the response to an LLM asking "Does this response mention or refer to [business name] in [location]?" This is a manual action, not automated.

### Improved Competitor Extraction

Replace the current regex-only approach with a two-pass method:

**Pass 1: Structural extraction** (fast, no API cost)
- Keep the existing regex patterns for markdown-formatted lists
- Add pattern for plain text lists: "Some businesses include X, Y, and Z"
- Add pattern for possessive references: "X's services include..."

**Pass 2: Entity deduplication**
- Deduplicate extracted names (e.g., "Joe's Hauling" and "Joe's Hauling LLC" are the same entity)
- Remove false positives: filter out generic phrases extracted as names ("Some Tips", "Important Note", etc.) by checking against a stopword list

### New/Modified Files

- `src/lib/scanner/analyzer.ts` — Rewrite with multi-strategy detection (modifying existing file)
- `src/lib/scanner/fuzzy-match.ts` — Levenshtein distance and token overlap utilities

---

## 6. Scanning Prompt Engineering

### Current State

The existing `tracking_queries` table stores a `query_template` per business, and `scanBusiness()` passes it directly to each platform. There's no prompt engineering — the user manually writes the query.

### Template Prompt Design

Design a prompt template system that generates effective queries based on business metadata.

**Base template for local service businesses (hauling, plumbing, etc.):**

```
What are the best {category} companies in {location}? I need someone who offers {services}. Please include their name, address, phone number, and any details about their services and pricing.
```

**Base template for B2B businesses (sign makers, etc.):**

```
I'm looking for a {category} in {location} that can handle {services}. Who would you recommend? Please include specific company names, what they specialize in, and how to contact them.
```

**Fact-eliciting template (optimized for hallucination detection):**

```
Tell me everything you know about {business_name} in {location}. Include their address, phone number, hours of operation, services they offer, pricing if known, and any reviews or reputation information.
```

### Prompt Variants per Business

Each business should have 4-6 prompt variants per scan cycle to get a representative sample:

| Variant | Purpose | Template |
|---------|---------|----------|
| **Discovery** | Does AI know this business exists? | "What {category} companies do you recommend in {location}?" |
| **Direct** | What does AI say about this specific business? | "Tell me about {business_name} in {location}." |
| **Comparison** | How does AI rank this business vs competitors? | "Compare the top {category} companies in {location}." |
| **Service-specific** | Does AI associate correct services? | "Who offers {specific_service} in {location}?" |
| **Fact-check** | Elicit specific claims for hallucination detection | "What are the hours, address, and phone number for {business_name} in {location}?" |
| **Neighborhood** | Test geographic precision | "I need a {category} near {neighborhood}, {city}." |

### Geographic Specificity Impact

Testing strategy for how location granularity affects results:
- City level: "hauling companies in Phoenix"
- Metro area: "hauling companies in the Phoenix metro area"
- Neighborhood: "hauling companies near Arcadia, Phoenix"
- Zip code: "hauling companies in 85018"

**Expected findings:** City-level queries produce the most results. Neighborhood/zip code queries may produce more targeted results but risk AI having less data. Store the geographic level used in each query for later analysis.

### Queries per Scan Cycle

**Recommendation:** 5 prompt variants x 4 platforms = 20 API calls per business per scan cycle. At weekly frequency, this balances comprehensive coverage with API cost.

### Auto-generation from Business Metadata

```typescript
// src/lib/scanner/prompt-generator.ts
export function generateQueries(business: {
  name: string;
  location: string;
  category: string;
  services?: string[];
}): string[] {
  const queries = [
    `What are the best ${business.category} companies in ${business.location}?`,
    `Tell me about ${business.name} in ${business.location}.`,
    `Compare the top ${business.category} options in ${business.location}. Include names, contact info, and what they specialize in.`,
    `What are the hours, address, and phone number for ${business.name} in ${business.location}?`,
  ];

  // Add service-specific queries
  if (business.services?.length) {
    const service = business.services[0];
    queries.push(
      `Who offers ${service} in ${business.location}? Please recommend specific companies.`
    );
  }

  return queries;
}
```

### Database Changes

```sql
-- Add services to businesses table for prompt generation
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS services text[];

-- Add metadata to tracking_queries for categorizing prompt types
ALTER TABLE tracking_queries ADD COLUMN IF NOT EXISTS query_type text DEFAULT 'custom';
-- query_type values: 'discovery', 'direct', 'comparison', 'service_specific', 'fact_check', 'neighborhood', 'custom'
ALTER TABLE tracking_queries ADD COLUMN IF NOT EXISTS geo_level text DEFAULT 'city';
-- geo_level values: 'city', 'metro', 'neighborhood', 'zip'
ALTER TABLE tracking_queries ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false;
```

### New Files Needed

- `src/lib/scanner/prompt-generator.ts` — Template-based query generation from business metadata

---

## 7. API Cost Modeling

### Per-Query Costs (as of April 2026)

| Model | Input Cost (per 1M tokens) | Output Cost (per 1M tokens) | Est. Input Tokens/Query | Est. Output Tokens/Query | Cost per Query |
|-------|---------------------------|----------------------------|------------------------|-------------------------|---------------|
| GPT-4o-mini | $0.15 | $0.60 | ~100 | ~500 | **$0.000315** |
| Claude Sonnet 4 | $3.00 | $15.00 | ~100 | ~500 | **$0.0078** |
| Gemini 2.0 Flash | $0.075 | $0.30 | ~100 | ~500 | **$0.000158** |
| Perplexity Sonar | $1.00 | $1.00 | ~100 | ~500 | **$0.0006** |
| GPT-4o-mini (LLM judge) | $0.15 | $0.60 | ~800 | ~100 | **$0.00018** |

### Cost per Scan Cycle (per business)

Assuming 5 queries x 4 platforms = 20 API calls per business:

| Component | Cost per Business |
|-----------|------------------|
| ChatGPT queries (5x) | $0.001575 |
| Claude queries (5x) | $0.039 |
| Gemini queries (5x) | $0.00079 |
| Perplexity queries (5x) | $0.003 |
| LLM judge calls (est. 10 per scan) | $0.0018 |
| **Total per business per scan** | **~$0.046** |

### Scaling Costs (Weekly Scans)

| Clients | Monthly Scans | Monthly Cost | Annual Cost |
|---------|--------------|-------------|------------|
| 3 | 12 | $0.55 | $6.62 |
| 10 | 40 | $1.84 | $22.08 |
| 50 | 200 | $9.20 | $110.40 |
| 100 | 400 | $18.40 | $220.80 |

**Claude is the cost driver** — it's ~85% of the per-query cost. Options to reduce:
1. Use Claude Haiku 4.5 instead of Sonnet 4 for scanning (10x cheaper, still good enough for generating recommendations)
2. Scan Claude less frequently than other platforms (biweekly instead of weekly)
3. Offer Claude scanning as a premium tier feature

### Break-Even Analysis

| Monthly Subscription Price | Break-Even Client Count | Revenue at 50 Clients |
|---------------------------|------------------------|----------------------|
| $29/mo | 1 client covers costs immediately | $1,450/mo |
| $49/mo | 1 client covers costs immediately | $2,450/mo |
| $99/mo | 1 client covers costs immediately | $4,950/mo |

**Key finding:** API costs are negligible compared to potential subscription revenue. Even at 100 clients on weekly scans, the total API cost is only ~$18.40/month. The tool owner should not optimize for API cost — it's not the bottleneck. The bottleneck is customer acquisition and delivering enough value to justify the subscription.

**Pricing recommendation for SaaS:**
- **Starter: $29/mo** — 1 business, weekly scans, 2 platforms (ChatGPT + Gemini), basic mention detection
- **Professional: $49/mo** — 3 businesses, weekly scans, all 4 platforms, hallucination detection
- **Agency: $99/mo** — 10 businesses, configurable scan frequency, all features, remediation checklists

### Cost Reduction Strategies

1. **Switch Claude to Haiku 4.5** for scanning: reduces Claude cost by ~10x. Total per-business drops from $0.046 to ~$0.012.
2. **Cache responses**: If the same query returns identical content within a week, skip re-analysis. Store a hash of the response text in `query_results`.
3. **Use Vercel AI Gateway**: Route through a single provider with fallbacks, which could simplify billing and add caching.

---

## 8. Trend Tracking and Dashboard Enhancements

### Visibility Score Aggregation Logic

The `visibility_scores` table exists but is never populated. The aggregation function (designed in section 4) runs after each scan cycle. For trend tracking, we need to query this data over time.

### Trend Chart Design

**Chart 1: Overall Visibility Over Time (line chart)**
- X axis: scan date (weekly ticks)
- Y axis: mention rate (0-100%)
- One line per platform, color-coded
- Overlaid events: "Added Google Business Profile", "Website launched" (from remediation checklist)

**Chart 2: Platform Comparison (radar/spider chart)**
- Axes: one per platform
- Current mention rate on each axis
- Overlay with previous period for trend direction

**Chart 3: Hallucination Trend (stacked bar chart)**
- X axis: scan date
- Y axis: count of flags
- Stacked by type: accurate (green), hallucination (red), outdated (orange), unverifiable (gray)

**Chart 4: Competitor Landscape (horizontal bar chart)**
- Top 10 competitors by mention frequency across all scans
- Colored by platform

### Dashboard Enhancements to Existing Pages

**`src/app/page.tsx` (main dashboard):**
- Add hallucination alert badges to each business card
- Add sparkline mini-charts showing 4-week mention rate trend
- Add "Last scanned" timestamp
- Add "Next scheduled scan" indicator (from cron schedule)

**`src/app/business/[id]/page.tsx` (business detail):**
- Add trend chart section above the results table
- Add "Hallucination Alerts" section with flagged issues
- Add "Digital Presence Score" summary from remediation checklist (e.g., "6/10 steps complete")
- Add "Recommendations" section — auto-generated from missing checklist items

### Notification/Alert System Design

**Phase 1 (MVP):** In-app alerts only
- Dashboard banner for critical issues ("3 new hallucinations detected in last scan")
- Red badge on business cards with unresolved hallucinations

**Phase 2:** Email notifications via Vercel's integration with a transactional email service (e.g., Resend via Vercel Marketplace)
- Weekly scan summary email
- Immediate alert for: new hallucination detected, visibility dropped >20% from previous scan, business not mentioned on any platform

### Database Changes

```sql
-- Alerts table for in-app notifications
CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  alert_type text NOT NULL,            -- 'hallucination_new', 'visibility_drop', 'visibility_gain', 'scan_failed'
  severity text NOT NULL DEFAULT 'info', -- 'critical', 'warning', 'info'
  title text NOT NULL,
  description text,
  is_read boolean DEFAULT false,
  is_resolved boolean DEFAULT false,
  metadata jsonb,                      -- flexible data (e.g., { field: "phone", ai_value: "555-0000", truth: "555-1234" })
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_alerts_business ON alerts(business_id);
CREATE INDEX idx_alerts_unread ON alerts(is_read) WHERE is_read = false;
```

### New Files Needed

- `src/components/charts/visibility-trend.tsx` — Line chart for visibility over time
- `src/components/charts/platform-radar.tsx` — Radar chart for platform comparison
- `src/components/charts/hallucination-trend.tsx` — Stacked bar chart for hallucination trends
- `src/components/alerts/alert-banner.tsx` — Dashboard alert banner component
- `src/app/api/alerts/route.ts` — CRUD API for alerts
- `src/lib/alerts/generator.ts` — Logic to generate alerts from scan results

### Chart Library

**Recommendation: Recharts** — Lightweight, React-native, good documentation, free. Install with `npm install recharts`.

Alternative: Vercel's `@vercel/analytics` for basic metrics, but it doesn't support custom charts.

---

## 9. Competitor Teardown

### Semrush AI Visibility (formerly Position Tracking AI Overviews)

**What it is:** Part of the Semrush suite (established SEO platform). Tracks whether a brand appears in AI-generated search results (Google AI Overviews, ChatGPT, Perplexity).

**Target market:** Enterprise and mid-market agencies. Minimum $139.95/month (Pro plan, which includes AI visibility as a feature within the broader SEO suite).

**Features:**
- Tracks brand mentions in Google AI Overviews
- Monitors Bing AI (Copilot) mentions
- Integration with broader Semrush keyword tracking
- Historical trending data
- Competitive comparison
- Covers ChatGPT and Perplexity in newer versions
- Brand Monitoring module detects online brand mentions across the web

**AI models monitored:** Google AI Overviews, Bing Copilot, ChatGPT, Perplexity (added recently)

**Hallucination detection:** No. Semrush only tracks whether a brand appears, not whether the information about it is correct.

**Local business support:** Weak. Designed for brands with strong online presence. No service-area business support. No remediation playbook for businesses with low/no presence.

**Pricing:**
- Pro: $139.95/mo (includes 500 keywords, 5 projects)
- Guru: $249.95/mo (includes 1,500 keywords, 15 projects)
- Business: $499.95/mo (includes 5,000 keywords, 40 projects)

**Biggest gaps for local businesses:**
- Overkill for a local hauling company — the entire Semrush suite is needed just to access AI visibility
- No hallucination detection
- No remediation recommendations
- No ground truth management
- Minimum cost is $139.95/mo even for one business

---

### AthenaHQ

**What it is:** AI visibility monitoring platform focused on enterprise brands. Tracks how AI models reference and describe brands.

**Target market:** Enterprise and large agencies. Custom pricing, typically $500+/mo.

**Features:**
- Multi-model monitoring (ChatGPT, Claude, Gemini, Perplexity)
- Brand sentiment analysis in AI responses
- Competitive positioning tracking
- Share of voice metrics across AI platforms
- Topic analysis — what topics is the brand associated with
- Executive reporting dashboards

**Hallucination detection:** Partial. Identifies "sentiment" issues (negative portrayal) but doesn't systematically compare against verified facts.

**Local business support:** None. Built for national/international brands. No service-area support. No understanding of the local business landscape.

**Pricing:** Custom enterprise pricing, reported $500-2,000+/mo.

**Biggest gaps:**
- Completely inaccessible for local businesses (price and complexity)
- No factual accuracy checking
- No remediation guidance
- No self-service model

---

### Otterly.ai

**What it is:** AI search analytics platform. Monitors how brands appear in AI-powered search engines. Closer to the GEO space than traditional SEO.

**Target market:** Mid-market brands and agencies. More accessible than AthenaHQ.

**Features:**
- Tracks brand visibility across ChatGPT, Perplexity, Google AI Overviews, Bing Copilot
- Keyword-level tracking (what queries trigger brand mentions)
- Weekly automated monitoring
- Competitive analysis
- Change detection (alerts when visibility changes)
- Prompt management — custom prompts for tracking

**AI models monitored:** ChatGPT, Perplexity, Google AI Overviews, Bing Copilot, Claude (limited)

**Hallucination detection:** No. Tracks presence/absence only.

**Local business support:** Limited. Can track local keywords but doesn't understand service areas, local directories, or the remediation needed for low-presence businesses.

**Pricing:**
- Starter: $25/mo (50 queries, 1 brand)
- Growth: $99/mo (250 queries, 3 brands)
- Pro: $249/mo (1,000 queries, 10 brands)

**Biggest gaps:**
- No hallucination detection
- No ground truth management
- No remediation playbook
- Limited local business understanding
- No client-facing portal (agencies can't give clients login access)

---

### Scrunch AI (scrunch.ai)

**What it is:** AI visibility and optimization platform. Focuses on helping brands understand and improve their AI search presence.

**Target market:** SMBs and agencies. More accessible pricing.

**Features:**
- AI mention tracking across multiple models
- "AI readiness score" — how well a brand's content is structured for AI consumption
- Content recommendations for improving AI visibility
- Competitive benchmarking
- Schema markup analysis
- Weekly monitoring reports

**AI models monitored:** ChatGPT, Gemini, Perplexity

**Hallucination detection:** No, but has an "accuracy assessment" feature that is more of a content quality score than true fact-checking.

**Local business support:** Some. The AI readiness score considers local SEO signals. But no specific service-area business support or remediation workflow.

**Pricing:**
- Free tier: 5 queries, limited features
- Pro: $39/mo (100 queries, 1 brand)
- Agency: $99/mo (500 queries, 5 brands)

**Biggest gaps:**
- No true hallucination detection (accuracy assessment is surface-level)
- No ground truth storage
- No remediation checklist
- Limited multi-tenant/client portal

---

### Geoptie

**What it is:** Newer entrant in the GEO space. Focuses on generative engine optimization with an emphasis on content strategy.

**Target market:** Content marketers and SEO agencies.

**Features:**
- Tracks brand mentions in AI search results
- Content gap analysis — what content to create to improve AI visibility
- Keyword clustering for AI optimization
- AI model response analysis
- Competitive tracking

**AI models monitored:** ChatGPT, Gemini, Perplexity (expanding)

**Hallucination detection:** No.

**Local business support:** Minimal. Focused on content marketing strategy, which is less relevant for a local hauling company.

**Pricing:** Early stage, pricing not widely published. Reports suggest $49-199/mo.

**Biggest gaps:**
- No hallucination detection
- No local business specialization
- No remediation workflows
- Content-marketing focused (not relevant for service-area businesses)

---

### Other Notable Players

**BrightLocal:** Local SEO platform. Has citation tracking and local rank monitoring but no AI visibility tracking. Could be a future competitor if they add AI features. Pricing: $39-79/mo.

**Whitespark:** Local citation building and tracking. No AI visibility features. Pricing: $41-150/mo.

**Profound (getprofound.ai):** Newer tool focused on AI search optimization. Tracks AI citations and recommends content changes. Pricing: $99-499/mo. No hallucination detection.

### Competitor Comparison Matrix

| Feature | Semrush | AthenaHQ | Otterly | Scrunch | Geoptie | **Our Tool** |
|---------|---------|----------|---------|---------|---------|-------------|
| AI mention tracking | Yes | Yes | Yes | Yes | Yes | **Yes** |
| Multi-model support | 4 | 4 | 5 | 3 | 3 | **4** |
| Hallucination detection | No | Partial | No | No | No | **Yes** |
| Ground truth management | No | No | No | No | No | **Yes** |
| Local business focus | No | No | Limited | Some | No | **Yes** |
| Service area support | No | No | No | No | No | **Yes** |
| Remediation playbook | No | No | No | No | No | **Yes** |
| Client portal | No | No | No | No | No | **Yes** |
| Pricing for 1 business | $139.95 | $500+ | $25 | Free-$39 | ~$49 | **$29** |
| Schema markup guidance | No | No | No | Yes | No | **Yes** |

---

## 10. Feasibility and Differentiation Matrix

### Feature Gap Scoring

Scoring each competitor gap on three dimensions (1-5 scale):
- **Effort**: 1 = trivial, 5 = major engineering project
- **Revenue Impact**: 1 = nice-to-have, 5 = would directly drive subscriptions
- **Differentiation**: 1 = table stakes, 5 = no competitor has this

| Feature Gap | Effort | Revenue Impact | Differentiation | Total Score | Category |
|------------|--------|---------------|-----------------|-------------|----------|
| Hallucination detection | 4 | 5 | 5 | **14** | Differentiator |
| Ground truth management | 3 | 4 | 5 | **12** | Differentiator |
| Remediation playbook/checklist | 2 | 5 | 4 | **11** | Differentiator |
| Client-facing portal (multi-tenant) | 3 | 5 | 3 | **11** | Differentiator |
| Automated weekly scanning | 2 | 4 | 2 | **8** | Table stakes |
| Trend charts & visibility history | 3 | 4 | 2 | **9** | Table stakes |
| Fuzzy mention detection | 2 | 3 | 2 | **7** | Table stakes |
| Email/notification alerts | 2 | 3 | 2 | **7** | Table stakes |
| Prompt template library | 1 | 3 | 2 | **6** | Table stakes |
| Schema markup generator | 3 | 3 | 3 | **9** | Nice-to-have |
| AI readiness score | 2 | 3 | 2 | **7** | Nice-to-have |
| Competitor intelligence reports | 3 | 3 | 2 | **8** | Nice-to-have |
| Content recommendations | 4 | 3 | 1 | **8** | Skip |
| Multi-language support | 4 | 2 | 1 | **7** | Skip |
| Google AI Overviews tracking | 4 | 3 | 1 | **8** | Skip for now |

### Unique Local-First, Hallucination-Detecting Gaps

These features are **unique to this tool** — no competitor combines all of:
1. **Hallucination detection with ground truth** — Only tool that checks factual accuracy, not just mention presence
2. **Local/service-area business specialization** — Built for businesses with small/no digital presence, not national brands
3. **Remediation workflow** — Directly actionable steps to improve AI visibility, integrated with the tool owner's web design services
4. **Client portal with role-based access** — Let clients see their own data without managing the tool

### Features That Feed the Tool Owner's Existing Services

The tool owner builds websites and manages social media. These features directly generate revenue for his existing business:

1. **Remediation checklist** — Shows clients exactly what they're missing (GBP, website, schema markup), then the tool owner sells the fix
2. **Hallucination detection** — Shows clients that AI is saying wrong things about them, creating urgency for the tool owner to fix their online presence
3. **Schema markup guidance** — The tool owner can add this to client websites as a value-add service
4. **Digital presence scoring** — Quantifiable metric the tool owner can use in sales pitches

### Top 3-5 Features to Build (Recommended Priority)

1. **Hallucination Detection** (Score: 14) — THE unique differentiator. No competitor does this. Directly drives the "AI is lying about your business" sales pitch. Build with ground truth management.

2. **Remediation Playbook** (Score: 11) — Low effort, high revenue impact. Directly feeds the tool owner's web design services. "Your business is invisible to AI — here's exactly what to fix. I can do it for you."

3. **Clerk Auth + Client Portal** (Score: 11) — Required for SaaS model. Without this, the tool is a single-user internal tool. Multi-tenant access is the difference between a tool and a product.

4. **Automated Scanning + Trend Tracking** (Score: 8+9=17 combined) — Table stakes but high impact when combined. Clients need to see progress over time. "Last month you were invisible. After I built your website and GBP, you're now mentioned 40% of the time."

5. **Improved Mention Detection** (Score: 7) — Relatively low effort and ensures the core metric (mention rate) is accurate. Foundation for everything else.

### Features to Explicitly NOT Build

| Feature | Why Skip |
|---------|----------|
| **Content recommendations engine** | High effort (4), low differentiation (1). Semrush, Scrunch, and Geoptie already do this. The tool owner gives content advice manually as part of his service. |
| **Multi-language support** | High effort (4), low relevance (2). The pilot businesses are US-based English-speaking. Premature optimization. |
| **Google AI Overviews tracking** | Requires scraping Google search results, which violates ToS and is technically fragile. Competitors with larger engineering teams struggle with this. Focus on direct API access to ChatGPT, Claude, Gemini, Perplexity. |
| **Custom AI model training** | Massive effort, no real-world need. The tool queries existing models, it doesn't need to train new ones. |
| **Mobile app** | The responsive web app is sufficient for the target audience. A mobile app adds build complexity for the same functionality. |
| **White-label/reseller features** | Premature. Build for direct customers first. Re-evaluate after 50+ clients. |

---

## 11. Prioritized Build Order

Build in this order. Each phase builds on the previous one.

### Phase 1: Foundation (Weeks 1-2)
1. **Clerk auth integration** — Required for everything else. Can't have clients without auth.
2. **Automated scanning (Vercel cron)** — Stop relying on manual scans.
3. **Visibility score aggregation** — Populate the existing `visibility_scores` table.

### Phase 2: Core Differentiators (Weeks 3-5)
4. **Ground truth data model + CRUD** — Create `business_ground_truth` table and management UI.
5. **Improved mention detection** — Upgrade analyzer from exact-match to multi-strategy fuzzy matching.
6. **Hallucination detection engine** — Build fact extraction, matching, and LLM-as-judge pipeline.

### Phase 3: Client Value (Weeks 6-8)
7. **Remediation checklist** — Digital presence assessment + actionable steps.
8. **Trend charts** — Visibility over time, hallucination trends.
9. **Alert system** — In-app notifications for critical issues.

### Phase 4: Growth (Weeks 9-12)
10. **Prompt template library** — Auto-generate queries based on business metadata.
11. **Client portal refinement** — Onboarding flow, email invites, polished UI.
12. **SaaS billing** — Stripe integration, pricing tiers.

---

## 12. Updated File Structure

```
src/
  app/
    page.tsx                          (existing — enhanced with badges, sparklines)
    add/page.tsx                      (existing)
    sign-in/[[...sign-in]]/page.tsx   (NEW — Clerk sign-in)
    sign-up/[[...sign-up]]/page.tsx   (NEW — Clerk sign-up)
    business/
      [id]/
        page.tsx                      (existing — enhanced with trend charts, alerts)
        ground-truth/page.tsx         (NEW — ground truth management form)
        remediation/page.tsx          (NEW — digital presence checklist)
    api/
      scan/route.ts                   (existing)
      businesses/route.ts             (existing)
      businesses/[id]/route.ts        (existing)
      ground-truth/route.ts           (NEW — CRUD for ground truth)
      remediation/route.ts            (NEW — CRUD for remediation checklist)
      alerts/route.ts                 (NEW — alerts CRUD)
      cron/scan/route.ts              (NEW — Vercel cron endpoint)
      webhooks/clerk/route.ts         (NEW — Clerk webhook handler)
      results/[id]/route.ts           (existing)
  components/
    charts/
      visibility-trend.tsx            (NEW — line chart)
      platform-radar.tsx              (NEW — radar chart)
      hallucination-trend.tsx         (NEW — stacked bar chart)
    alerts/
      alert-banner.tsx                (NEW — dashboard banner)
  lib/
    auth.ts                           (NEW — Clerk auth helpers)
    supabase.ts                       (existing)
    scanner/
      index.ts                        (existing — enhanced with aggregation call)
      analyzer.ts                     (existing — rewritten with fuzzy matching)
      fuzzy-match.ts                  (NEW — Levenshtein, token overlap utilities)
      hallucination-detector.ts       (NEW — three-tier hallucination detection)
      fact-extractor.ts               (NEW — extract factual claims from responses)
      llm-judge.ts                    (NEW — GPT-4o-mini fact checking)
      prompt-generator.ts             (NEW — template-based query generation)
      aggregator.ts                   (NEW — visibility score aggregation)
      platforms/
        chatgpt.ts                    (existing)
        claude.ts                     (existing)
        gemini.ts                     (existing)
        perplexity.ts                 (existing)
    remediation/
      checklist-template.ts           (NEW — default checklist by category)
    alerts/
      generator.ts                    (NEW — alert generation from scan results)
  middleware.ts                       (NEW — Clerk middleware)
supabase/
  001_initial_schema.sql              (existing)
  002_ground_truth.sql                (NEW — ground truth + hallucination flags tables)
  003_auth_and_alerts.sql             (NEW — user access, remediation, alerts, scan logs)
```

---

## 13. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | **AI model API changes break scanner** — OpenAI, Anthropic, or Google change their API response format, pricing, or rate limits without warning. | High | High | Abstract platform queries behind a common interface (already done in `src/lib/scanner/index.ts`). Pin SDK versions. Add response format validation. Monitor for API deprecation notices. |
| 2 | **Hallucination detection false positives** — The system incorrectly flags accurate AI responses as hallucinations due to stale ground truth or fuzzy matching errors. | High | Medium | Show confidence scores. Require ground truth to be verified within 90 days. Allow business owners to dismiss false flags. Default to "unverifiable" rather than "hallucination" when uncertain. |
| 3 | **Cron job timeout on Vercel** — With many businesses, the weekly scan could exceed Vercel's 300s function timeout. | Medium | High | At 5 queries x 4 platforms per business, each business takes ~30-60 seconds. With 300s timeout, max ~5-8 businesses per cron run. For >8 businesses, split into batches using multiple cron entries or use Vercel Queues. |
| 4 | **LLM-as-judge cost explosion** — If every claim in every response goes through LLM-as-judge, costs scale faster than expected. | Medium | Medium | Use LLM-as-judge only for fields that can't be exact/fuzzy matched (pricing, subjective claims). Pre-filter with regex extraction. Set a per-business cap on LLM judge calls (max 10 per scan). |
| 5 | **Clerk free tier limits** — Clerk's free tier supports 10,000 MAU. If the tool grows beyond that, costs jump. | Low | Medium | 10,000 MAU is generous for an early SaaS. At $29-99/client, even 20 clients + their employees would be <100 MAU. Re-evaluate when approaching 1,000 users. |
| 6 | **Business with zero presence never gets AI visibility** — Despite following the remediation playbook, some businesses are too small/new to appear in AI responses for months. | High | Medium | Set expectations upfront: search-augmented AI (Perplexity) responds first (2-4 weeks), base model AI takes 3-12 months. Track Perplexity as the early indicator. Show progress in remediation steps completed, not just mention rate. |
| 7 | **Competitor launches hallucination detection first** — A well-funded competitor (Semrush, Otterly) adds hallucination detection before this tool does. | Medium | High | Speed to market matters. Build hallucination detection in Phase 2 (weeks 3-5). The local-first angle is harder for enterprise tools to replicate — they'd need to redesign their UX for small businesses. |
| 8 | **Data privacy / storing AI responses** — Storing full AI response text in `query_results.response_text` could raise privacy concerns if responses contain information about individuals. | Low | Medium | AI responses about businesses rarely contain PII. Add a data retention policy: auto-delete response text older than 12 months, keep only aggregated scores. Add privacy policy to the app. |

---

## SCORECARD

| Section | Actionable Specificity (1-5) | References Real Code (1-5) | Completeness vs Brief (1-5) | Notes |
|---------|------------------------------|---------------------------|----------------------------|-------|
| 1. Hallucination Detection | 5 | 5 | 5 | SQL, matching strategies, accuracy expectations, field-by-field design, references `analyzer.ts` and `query_results` table |
| 2. Digital Presence | 4 | 3 | 5 | Comprehensive playbook. SQL added. Could reference more existing code. |
| 3. Clerk Auth | 5 | 5 | 5 | Route protection map references all existing pages, middleware code, SQL for access table |
| 4. Automated Scanning | 5 | 5 | 5 | References existing `scanBusiness()`, `visibility_scores` table, concrete cron route code, rate limiting for actual API limits |
| 5. Mention Detection | 5 | 5 | 5 | References specific lines in `analyzer.ts`, four-strategy design with confidence scoring |
| 6. Prompt Engineering | 4 | 4 | 5 | Template code, SQL for query metadata. References `tracking_queries` table and `query_template` field. |
| 7. Cost Modeling | 5 | 4 | 5 | Actual model names from code (gpt-4o-mini, claude-sonnet-4), per-query calculations, scaling table, break-even |
| 8. Trend Tracking | 4 | 4 | 5 | Chart designs, dashboard enhancement plan for existing pages, SQL for alerts. References `visibility_scores` table. |
| 9. Competitor Teardown | 4 | 3 | 5 | Feature-by-feature breakdown of all 5+ competitors, comparison matrix. Less code-referencing but that's expected for market research. |
| 10. Feasibility Matrix | 5 | 4 | 5 | Scoring matrix, top 5 recommendations, explicit skip list with rationale, ties to tool owner's business model |
| Build Order | 5 | 5 | 5 | Phased with weeks, references all sections |
| File Structure | 5 | 5 | 5 | Shows existing vs new files, maps to actual repo structure |
| Risk Register | 5 | 4 | 5 | 8 entries (brief asked for 5+), references real constraints (300s timeout, Clerk 10k MAU, API rate limits) |

**Overall Assessment:** All sections score 4+ on all three criteria. The lowest scores are in "References Real Code" for sections 2, 9 where the content is primarily market research rather than code design, which is expected. Every section that involves design decisions references actual code interfaces, table schemas, and file paths from the existing codebase.

<promise>RESEARCH_COMPLETE</promise>
