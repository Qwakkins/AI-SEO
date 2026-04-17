# Hallucination Detection Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when AI platforms state incorrect facts about a business by comparing AI responses against user-verified ground truth data.

**Architecture:** Post-scan pipeline — after each scan, extract factual claims from AI responses using regex, then compare against ground truth using exact match (phone, website) and fuzzy match (address via Levenshtein, services via substring). Results stored as hallucination flags and displayed on the business detail page.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres), TypeScript, Tailwind CSS v4

**Note:** This project has no test runner (no jest/vitest). Verification uses `npx tsc --noEmit` for type safety and manual browser testing for UI.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/005_ground_truth.sql` | business_ground_truth table migration |
| `supabase/006_hallucination_flags.sql` | hallucination_flags table + indexes |
| `src/lib/scanner/fact-extractor.ts` | Regex-based extraction of factual claims from AI responses |
| `src/lib/scanner/hallucination-detector.ts` | Matching engine + pipeline orchestration |
| `src/app/api/ground-truth/[businessId]/route.ts` | GET/POST ground truth CRUD |
| `src/app/api/hallucinations/[businessId]/route.ts` | GET hallucination flags for a business |

### Modified Files
| File | Change |
|------|--------|
| `src/app/api/scan/route.ts:24` | Add `detectHallucinations()` call after `aggregateVisibilityScores()` |
| `src/app/api/cron/scan/route.ts:64` | Add `detectHallucinations()` call after `aggregateVisibilityScores()` |
| `src/app/business/[id]/page.tsx` | Add ground truth form + hallucination flags display sections |

---

### Task 1: SQL Migrations

**Files:**
- Create: `supabase/005_ground_truth.sql`
- Create: `supabase/006_hallucination_flags.sql`

- [ ] **Step 1: Create ground truth migration**

Create `supabase/005_ground_truth.sql`:

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

- [ ] **Step 2: Create hallucination flags migration**

Create `supabase/006_hallucination_flags.sql`:

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

- [ ] **Step 3: Run migrations in Supabase**

Run both SQL files in the Supabase SQL editor, in order (005 first, then 006).

- [ ] **Step 4: Commit**

```bash
git add supabase/005_ground_truth.sql supabase/006_hallucination_flags.sql
git commit -m "feat: add ground truth and hallucination flags tables"
```

---

### Task 2: Fact Extractor

**Files:**
- Create: `src/lib/scanner/fact-extractor.ts`

- [ ] **Step 1: Create the fact extractor module**

Create `src/lib/scanner/fact-extractor.ts`:

```typescript
export interface ExtractedFacts {
  phones: string[];
  addresses: string[];
  websites: string[];
  services: string[];
}

/**
 * Extract factual claims from an AI response about a business.
 * Uses regex-based extraction — intentionally conservative.
 * Missing some claims is acceptable; false extraction is not.
 */
export function extractFacts(responseText: string): ExtractedFacts {
  return {
    phones: extractPhones(responseText),
    addresses: extractAddresses(responseText),
    websites: extractWebsites(responseText),
    services: extractServices(responseText),
  };
}

function extractPhones(text: string): string[] {
  // Match (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +1xxxxxxxxxx
  const phoneRegex =
    /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g;
  const phones: string[] = [];
  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    phones.push(match[0]);
  }
  return phones;
}

function extractAddresses(text: string): string[] {
  // Match street addresses: number + street name + street type
  const streetTypes =
    "Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl";
  const addressRegex = new RegExp(
    `\\d+\\s+[\\w\\s]+?(?:${streetTypes})\\.?(?:\\s*,?\\s*[\\w\\s]+,?\\s*[A-Z]{2}\\s*\\d{5}(?:-\\d{4})?)?`,
    "gi"
  );
  const addresses: string[] = [];
  let match;
  while ((match = addressRegex.exec(text)) !== null) {
    const addr = match[0].trim();
    if (addr.length > 5 && addr.length < 200) {
      addresses.push(addr);
    }
  }
  return addresses;
}

function extractWebsites(text: string): string[] {
  // Match URLs and bare domains
  const urlRegex =
    /https?:\/\/[^\s<>")\]]+/gi;
  const domainRegex =
    /(?:^|\s)((?:www\.)?[\w-]+\.(?:com|net|org|biz|io|co|us|info)(?:\/\S*)?)/gi;

  const websites: string[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:!?)]+$/, ""); // strip trailing punctuation
    const domain = normalizeDomain(url);
    if (!seen.has(domain)) {
      seen.add(domain);
      websites.push(url);
    }
  }

  while ((match = domainRegex.exec(text)) !== null) {
    const domain = normalizeDomain(match[1]);
    if (!seen.has(domain)) {
      seen.add(domain);
      websites.push(match[1].trim());
    }
  }

  return websites;
}

function extractServices(text: string): string[] {
  const services: string[] = [];
  const seen = new Set<string>();

  // Bullet/numbered list items
  const listRegex = /(?:^|\n)\s*(?:[-•*]|\d+[.)]\s)\s*(.+)/g;
  let match;
  while ((match = listRegex.exec(text)) !== null) {
    addService(match[1].trim(), services, seen);
  }

  // "offers X, Y, and Z" / "specializes in X, Y, and Z" / "known for X, Y, and Z"
  const phraseRegex =
    /(?:offers?|provides?|specializ(?:es|ing) in|known for|services? include)\s+(.+?)(?:\.|$)/gi;
  while ((match = phraseRegex.exec(text)) !== null) {
    const items = match[1].split(/,\s*(?:and\s+)?|,?\s+and\s+/);
    for (const item of items) {
      addService(item.trim(), services, seen);
    }
  }

  return services;
}

function addService(
  service: string,
  services: string[],
  seen: Set<string>
): void {
  // Clean up markdown formatting
  const cleaned = service.replace(/\*+/g, "").replace(/\[.*?\]/g, "").trim();
  if (
    cleaned.length > 1 &&
    cleaned.length < 100 &&
    !seen.has(cleaned.toLowerCase())
  ) {
    seen.add(cleaned.toLowerCase());
    services.push(cleaned);
  }
}

function normalizeDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\/$/, "");
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No errors related to `fact-extractor.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scanner/fact-extractor.ts
git commit -m "feat: add regex-based fact extractor for AI responses"
```

---

### Task 3: Hallucination Detector

**Files:**
- Create: `src/lib/scanner/hallucination-detector.ts`

- [ ] **Step 1: Create the hallucination detector module**

Create `src/lib/scanner/hallucination-detector.ts`:

```typescript
import { getSupabase } from "@/lib/supabase";
import { extractFacts, type ExtractedFacts } from "./fact-extractor";

interface GroundTruthRecord {
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  website_url: string | null;
  services: string[];
}

interface MatchResult {
  field: string;
  ai_claim: string;
  ground_truth_value: string | null;
  flag_type: "incorrect" | "unverifiable" | "not_mentioned";
  confidence: number;
}

// --- Normalization helpers ---

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  st: "street",
  ave: "avenue",
  blvd: "boulevard",
  dr: "drive",
  rd: "road",
  ln: "lane",
  ct: "court",
  pl: "place",
};

function normalizeAddress(addr: string): string {
  let normalized = addr.toLowerCase().trim();
  for (const [abbr, full] of Object.entries(ADDRESS_ABBREVIATIONS)) {
    normalized = normalized.replace(
      new RegExp(`\\b${abbr}\\.?\\b`, "g"),
      full
    );
  }
  return normalized.replace(/\s+/g, " ").replace(/,/g, "");
}

function normalizeDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\/$/, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// --- Matching engine ---

export function matchFacts(
  facts: ExtractedFacts,
  gt: GroundTruthRecord
): MatchResult[] {
  const results: MatchResult[] = [];

  // Phone matching
  if (facts.phones.length > 0) {
    if (gt.phone) {
      const gtDigits = normalizePhone(gt.phone);
      for (const aiPhone of facts.phones) {
        const aiDigits = normalizePhone(aiPhone);
        if (aiDigits !== gtDigits) {
          results.push({
            field: "phone",
            ai_claim: aiPhone,
            ground_truth_value: gt.phone,
            flag_type: "incorrect",
            confidence: 1.0,
          });
        }
      }
    } else {
      for (const aiPhone of facts.phones) {
        results.push({
          field: "phone",
          ai_claim: aiPhone,
          ground_truth_value: null,
          flag_type: "unverifiable",
          confidence: 1.0,
        });
      }
    }
  } else if (gt.phone) {
    results.push({
      field: "phone",
      ai_claim: "",
      ground_truth_value: gt.phone,
      flag_type: "not_mentioned",
      confidence: 1.0,
    });
  }

  // Address matching
  const gtAddress = [gt.address_street, gt.address_city, gt.address_state, gt.address_zip]
    .filter(Boolean)
    .join(", ");

  if (facts.addresses.length > 0) {
    if (gtAddress) {
      const gtNorm = normalizeAddress(gtAddress);
      for (const aiAddr of facts.addresses) {
        const aiNorm = normalizeAddress(aiAddr);
        const distance = levenshtein(aiNorm, gtNorm);
        if (distance > 3) {
          results.push({
            field: "address",
            ai_claim: aiAddr,
            ground_truth_value: gtAddress,
            flag_type: "incorrect",
            confidence: 0.8,
          });
        }
      }
    } else {
      for (const aiAddr of facts.addresses) {
        results.push({
          field: "address",
          ai_claim: aiAddr,
          ground_truth_value: null,
          flag_type: "unverifiable",
          confidence: 1.0,
        });
      }
    }
  } else if (gtAddress) {
    results.push({
      field: "address",
      ai_claim: "",
      ground_truth_value: gtAddress,
      flag_type: "not_mentioned",
      confidence: 1.0,
    });
  }

  // Website matching
  if (facts.websites.length > 0) {
    if (gt.website_url) {
      const gtDomain = normalizeDomain(gt.website_url);
      for (const aiUrl of facts.websites) {
        const aiDomain = normalizeDomain(aiUrl);
        if (aiDomain !== gtDomain) {
          results.push({
            field: "website",
            ai_claim: aiUrl,
            ground_truth_value: gt.website_url,
            flag_type: "incorrect",
            confidence: 1.0,
          });
        }
      }
    } else {
      for (const aiUrl of facts.websites) {
        results.push({
          field: "website",
          ai_claim: aiUrl,
          ground_truth_value: null,
          flag_type: "unverifiable",
          confidence: 1.0,
        });
      }
    }
  } else if (gt.website_url) {
    results.push({
      field: "website",
      ai_claim: "",
      ground_truth_value: gt.website_url,
      flag_type: "not_mentioned",
      confidence: 1.0,
    });
  }

  // Services matching
  if (facts.services.length > 0 && gt.services.length > 0) {
    for (const aiService of facts.services) {
      const aiLower = aiService.toLowerCase();
      const matched = gt.services.some((gtService) => {
        const gtLower = gtService.toLowerCase();
        return aiLower.includes(gtLower) || gtLower.includes(aiLower);
      });
      if (!matched) {
        results.push({
          field: "services",
          ai_claim: aiService,
          ground_truth_value: gt.services.join(", "),
          flag_type: "unverifiable",
          confidence: 0.7,
        });
      }
    }
    // Ground truth services not mentioned by AI
    for (const gtService of gt.services) {
      const gtLower = gtService.toLowerCase();
      const mentioned = facts.services.some((aiService) => {
        const aiLower = aiService.toLowerCase();
        return aiLower.includes(gtLower) || gtLower.includes(aiLower);
      });
      if (!mentioned) {
        results.push({
          field: "services",
          ai_claim: "",
          ground_truth_value: gtService,
          flag_type: "not_mentioned",
          confidence: 1.0,
        });
      }
    }
  } else if (facts.services.length > 0) {
    for (const aiService of facts.services) {
      results.push({
        field: "services",
        ai_claim: aiService,
        ground_truth_value: null,
        flag_type: "unverifiable",
        confidence: 1.0,
      });
    }
  }

  return results;
}

// --- Pipeline orchestration ---

/**
 * Run hallucination detection for a business after scanning.
 * Queries today's scan results from the database, extracts facts,
 * compares against ground truth, and stores flags.
 *
 * Safe to call even if no ground truth exists (no-ops gracefully).
 */
export async function detectHallucinations(
  businessId: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // Load ground truth
  const { data: gt } = await supabase
    .from("business_ground_truth")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (!gt) return; // No ground truth — nothing to check

  // Get today's scan results for this business
  const today = new Date().toISOString().split("T")[0];
  const { data: queryResults } = await supabase
    .from("query_results")
    .select(
      "id, response_text, business_mentioned, tracking_queries!inner(business_id)"
    )
    .eq("tracking_queries.business_id", businessId)
    .gte("queried_at", `${today}T00:00:00.000Z`)
    .eq("business_mentioned", true);

  if (!queryResults || queryResults.length === 0) return;

  for (const result of queryResults) {
    // Delete existing flags for this result (avoid duplicates on re-scan)
    await supabase
      .from("hallucination_flags")
      .delete()
      .eq("query_result_id", result.id);

    // Extract facts from the AI response
    const facts = extractFacts(result.response_text);

    // Compare against ground truth
    const flags = matchFacts(facts, gt);

    // Insert new flags
    if (flags.length > 0) {
      const rows = flags.map((f) => ({
        query_result_id: result.id,
        business_id: businessId,
        field: f.field,
        ai_claim: f.ai_claim,
        ground_truth_value: f.ground_truth_value,
        flag_type: f.flag_type,
        confidence: f.confidence,
      }));

      const { error } = await supabase
        .from("hallucination_flags")
        .insert(rows);

      if (error) {
        console.error("Failed to insert hallucination flags:", error.message);
      }
    }
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No errors related to `hallucination-detector.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scanner/hallucination-detector.ts
git commit -m "feat: add hallucination detector with matching engine"
```

---

### Task 4: Ground Truth API Route

**Files:**
- Create: `src/app/api/ground-truth/[businessId]/route.ts`

- [ ] **Step 1: Create the ground truth API route**

Create `src/app/api/ground-truth/[businessId]/route.ts`:

```typescript
import { getSupabase } from "@/lib/supabase";
import { checkBusinessAccess } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  const access = await checkBusinessAccess(businessId);
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data } = await supabase
    .from("business_ground_truth")
    .select("*")
    .eq("business_id", businessId)
    .single();

  return Response.json(data || {});
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  const access = await checkBusinessAccess(businessId, "editor");
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const body = await request.json();

  const { data, error } = await supabase
    .from("business_ground_truth")
    .upsert(
      {
        business_id: businessId,
        phone: body.phone || null,
        address_street: body.address_street || null,
        address_city: body.address_city || null,
        address_state: body.address_state || null,
        address_zip: body.address_zip || null,
        website_url: body.website_url || null,
        services: body.services || [],
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id" }
    )
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ground-truth/[businessId]/route.ts
git commit -m "feat: add ground truth GET/POST API route"
```

---

### Task 5: Hallucination Flags API Route

**Files:**
- Create: `src/app/api/hallucinations/[businessId]/route.ts`

- [ ] **Step 1: Create the hallucination flags API route**

Create `src/app/api/hallucinations/[businessId]/route.ts`:

```typescript
import { getSupabase } from "@/lib/supabase";
import { checkBusinessAccess } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  const access = await checkBusinessAccess(businessId);
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: flags, error } = await supabase
    .from("hallucination_flags")
    .select(
      "*, query_results(platform, queried_at, tracking_queries(query_template))"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ flags: flags || [] });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/hallucinations/[businessId]/route.ts
git commit -m "feat: add hallucination flags GET API route"
```

---

### Task 6: Pipeline Integration

**Files:**
- Modify: `src/app/api/scan/route.ts:24`
- Modify: `src/app/api/cron/scan/route.ts:64`

- [ ] **Step 1: Add hallucination detection to manual scan route**

In `src/app/api/scan/route.ts`, add the import at the top:

```typescript
import { detectHallucinations } from "@/lib/scanner/hallucination-detector";
```

Then add the call after `aggregateVisibilityScores` (line 24), inside the existing try block:

```typescript
    await aggregateVisibilityScores(business_id, results);

    try {
      await detectHallucinations(business_id);
    } catch (err) {
      console.error("Hallucination detection failed:", err);
    }
```

The try-catch ensures hallucination detection errors don't break the scan response.

- [ ] **Step 2: Add hallucination detection to cron scan route**

In `src/app/api/cron/scan/route.ts`, add the import at the top:

```typescript
import { detectHallucinations } from "@/lib/scanner/hallucination-detector";
```

Then add the call after `aggregateVisibilityScores` (line 64), inside the existing per-business try block:

```typescript
      await aggregateVisibilityScores(biz.id, scanResults);

      try {
        await detectHallucinations(biz.id);
      } catch (err) {
        console.error("Hallucination detection failed for", biz.name, err);
      }
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/scan/route.ts src/app/api/cron/scan/route.ts
git commit -m "feat: integrate hallucination detection into scan pipeline"
```

---

### Task 7: Ground Truth Form UI

**Files:**
- Modify: `src/app/business/[id]/page.tsx`

This task adds the "Business Facts" form section to the business detail page, between the "Tracking Queries" section and "Scan Results." It also adds state variables, interfaces, and data-fetching for both ground truth and hallucination flags.

- [ ] **Step 1: Add new interfaces after existing interfaces**

In `src/app/business/[id]/page.tsx`, add after the `ScanResponse` interface (after line 43):

```typescript
interface GroundTruth {
  id: string;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  website_url: string | null;
  services: string[];
  verified_at: string | null;
}

interface HallucinationFlag {
  id: string;
  field: string;
  ai_claim: string;
  ground_truth_value: string | null;
  flag_type: "incorrect" | "unverifiable" | "not_mentioned";
  confidence: number;
  created_at: string;
  query_results: {
    platform: string;
    queried_at: string;
    tracking_queries: { query_template: string };
  };
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY","DC",
];
```

- [ ] **Step 2: Add new state variables after existing state**

Add after the `loading` state (after line 55):

```typescript
  const [groundTruth, setGroundTruth] = useState<GroundTruth | null>(null);
  const [flags, setFlags] = useState<HallucinationFlag[]>([]);
  const [savingGT, setSavingGT] = useState(false);
  const [gtForm, setGtForm] = useState({
    phone: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    website_url: "",
    services: "",
  });
```

- [ ] **Step 3: Update useEffect to fetch ground truth and flags**

Replace the existing `useEffect` (lines 57-69) with:

```typescript
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/businesses/${id}`).then((r) => r.json()),
      fetch(`/api/results/${id}`).then((r) => r.json()),
      fetch(`/api/ground-truth/${id}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/hallucinations/${id}`).then((r) => r.json()).catch(() => ({ flags: [] })),
    ]).then(([bizData, resultsData, gtData, flagsData]) => {
      setBusiness(bizData);
      setResults(resultsData.results || []);
      setSummary(resultsData.summary || []);
      if (resultsData.results?.length > 0) setScanComplete(true);
      if (gtData && gtData.id) {
        setGroundTruth(gtData);
        setGtForm({
          phone: gtData.phone || "",
          address_street: gtData.address_street || "",
          address_city: gtData.address_city || "",
          address_state: gtData.address_state || "",
          address_zip: gtData.address_zip || "",
          website_url: gtData.website_url || "",
          services: (gtData.services || []).join(", "),
        });
      }
      setFlags(flagsData.flags || []);
      setLoading(false);
    });
  }, [id]);
```

- [ ] **Step 4: Add saveGroundTruth function and refresh flags after scan**

Add the `saveGroundTruth` function after the `runScan` function:

```typescript
  async function saveGroundTruth() {
    setSavingGT(true);
    const body = {
      phone: gtForm.phone || null,
      address_street: gtForm.address_street || null,
      address_city: gtForm.address_city || null,
      address_state: gtForm.address_state || null,
      address_zip: gtForm.address_zip || null,
      website_url: gtForm.website_url || null,
      services: gtForm.services
        ? gtForm.services.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    };

    const res = await fetch(`/api/ground-truth/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      setGroundTruth(data);
    }
    setSavingGT(false);
  }

  function timeAgo(dateStr: string): string {
    const seconds = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 1000
    );
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
```

Also, at the end of the existing `runScan` function, after the results refresh (after line 98), add:

```typescript
    // Refresh hallucination flags
    const flagsRefresh = await fetch(`/api/hallucinations/${id}`).then((r) =>
      r.json()
    );
    setFlags(flagsRefresh.flags || []);
```

- [ ] **Step 5: Add the Business Facts form section in the JSX**

Add the following JSX after the Tracking Queries section (after the closing `</div>` of the `mb-8` div at line 341) and before the Results Table section:

```tsx
      {/* Business Facts (Ground Truth) */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-1 text-white">
          Business Facts
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Enter verified information to detect AI hallucinations
        </p>
        <div className="bg-[#161616] border border-gray-700 rounded-lg p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Phone
            </label>
            <input
              type="text"
              value={gtForm.phone}
              onChange={(e) =>
                setGtForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="(619) 226-6333"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Address
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={gtForm.address_street}
                onChange={(e) =>
                  setGtForm((prev) => ({
                    ...prev,
                    address_street: e.target.value,
                  }))
                }
                placeholder="1815 Newton Ave"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                value={gtForm.address_city}
                onChange={(e) =>
                  setGtForm((prev) => ({
                    ...prev,
                    address_city: e.target.value,
                  }))
                }
                placeholder="San Diego"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={gtForm.address_state}
                onChange={(e) =>
                  setGtForm((prev) => ({
                    ...prev,
                    address_state: e.target.value,
                  }))
                }
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">State</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={gtForm.address_zip}
                onChange={(e) =>
                  setGtForm((prev) => ({
                    ...prev,
                    address_zip: e.target.value,
                  }))
                }
                placeholder="92113"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Website
            </label>
            <input
              type="text"
              value={gtForm.website_url}
              onChange={(e) =>
                setGtForm((prev) => ({
                  ...prev,
                  website_url: e.target.value,
                }))
              }
              placeholder="philsbbq.net"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Services
            </label>
            <input
              type="text"
              value={gtForm.services}
              onChange={(e) =>
                setGtForm((prev) => ({
                  ...prev,
                  services: e.target.value,
                }))
              }
              placeholder="BBQ, catering, dine-in"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Separate services with commas
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={saveGroundTruth}
              disabled={savingGT}
              className="bg-blue-500 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {savingGT ? "Saving..." : "Save Facts"}
            </button>
            {groundTruth?.verified_at && (
              <span className="text-xs text-gray-500">
                Last verified: {timeAgo(groundTruth.verified_at)}
              </span>
            )}
          </div>
        </div>
      </div>
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/business/[id]/page.tsx
git commit -m "feat: add ground truth form to business detail page"
```

---

### Task 8: Fact Check Display UI

**Files:**
- Modify: `src/app/business/[id]/page.tsx`

This task adds the "Fact Check" section between "AI Visibility Summary" and "Tracking Queries."

- [ ] **Step 1: Add the Fact Check section in the JSX**

Add the following JSX after the AI Visibility Summary section (after the closing `</div>` of the Platform Summary `mb-8` div at line 322) and before the Tracking Queries section:

```tsx
      {/* Fact Check */}
      {scanComplete && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">Fact Check</h2>
          {!groundTruth ? (
            <p className="text-sm text-gray-500">
              Add business facts below to enable hallucination detection
            </p>
          ) : flags.filter((f) => f.flag_type !== "not_mentioned").length ===
            0 ? (
            <div className="bg-green-900/30 border border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-300 font-medium">
                No hallucinations detected
              </p>
              <p className="text-xs text-green-400/70 mt-1">
                All AI-stated facts match your verified information
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-3">
                {flags.filter((f) => f.flag_type === "incorrect").length}{" "}
                incorrect{" "}
                {flags.filter((f) => f.flag_type === "incorrect").length === 1
                  ? "fact"
                  : "facts"}{" "}
                found across{" "}
                {
                  new Set(
                    flags
                      .filter((f) => f.flag_type !== "not_mentioned")
                      .map((f) => f.query_results?.platform)
                  ).size
                }{" "}
                {new Set(
                  flags
                    .filter((f) => f.flag_type !== "not_mentioned")
                    .map((f) => f.query_results?.platform)
                ).size === 1
                  ? "platform"
                  : "platforms"}
              </p>
              <div className="space-y-3">
                {flags
                  .filter((f) => f.flag_type !== "not_mentioned")
                  .map((flag) => (
                    <div
                      key={flag.id}
                      className={`rounded-lg border p-4 ${
                        flag.flag_type === "incorrect"
                          ? "border-red-800 bg-red-900/20"
                          : "border-yellow-800 bg-yellow-900/20"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white capitalize">
                          {flag.field}
                        </span>
                        <span className="text-xs text-gray-500">
                          <span className="capitalize">
                            {flag.query_results?.platform}
                          </span>
                          {flag.query_results?.tracking_queries
                            ?.query_template &&
                            ` \u00b7 ${flag.query_results.tracking_queries.query_template}`}
                        </span>
                      </div>
                      <div className="text-sm space-y-1">
                        <p className="text-red-400">
                          <span className="text-gray-500">AI said:</span>{" "}
                          {flag.ai_claim || "—"}
                        </p>
                        {flag.ground_truth_value && (
                          <p className="text-green-400">
                            <span className="text-gray-500">Correct:</span>{" "}
                            {flag.ground_truth_value}
                          </p>
                        )}
                      </div>
                      {flag.flag_type === "unverifiable" && (
                        <p className="text-xs text-yellow-500/70 mt-2">
                          Could not verify — no ground truth for this field
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Test in browser**

Run: `npm run dev`

Navigate to a business detail page. Verify:
1. The "Business Facts" form appears between "Tracking Queries" and "Scan Results"
2. The "Fact Check" section appears between "AI Visibility Summary" and "Tracking Queries"
3. All form fields render with dark mode styling
4. "Fact Check" shows the prompt to add business facts when no ground truth exists
5. Form inputs accept text and the state dropdown works

- [ ] **Step 4: Commit**

```bash
git add src/app/business/[id]/page.tsx
git commit -m "feat: add fact check display to business detail page"
```

---

### Task 9: End-to-End Verification

This task validates the full pipeline works by testing with a real business.

- [ ] **Step 1: Run the SQL migrations**

Run `supabase/005_ground_truth.sql` and `supabase/006_hallucination_flags.sql` in the Supabase SQL editor. Verify the tables exist:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('business_ground_truth', 'hallucination_flags');
```

Expected: Both tables listed.

- [ ] **Step 2: Add ground truth for Phil's BBQ**

In the browser, navigate to the Phil's BBQ business detail page. In the "Business Facts" form, enter:
- Phone: `(619) 226-6333`
- Address: `1815 Newton Ave`, `San Diego`, `CA`, `92113`
- Website: `philsbbq.net`
- Services: `BBQ, catering, dine-in, takeout`

Click "Save Facts." Verify "Last verified: just now" appears.

- [ ] **Step 3: Run a scan and check flags**

Click "Run Scan" on the Phil's BBQ page. After the scan completes:
- If AI responses contain correct facts: "Fact Check" should show "No hallucinations detected" in green
- If AI responses contain any wrong facts: flag cards should appear with red (incorrect) or yellow (unverifiable) borders

- [ ] **Step 4: Test with intentionally wrong ground truth**

Edit the phone number in the form to a wrong number (e.g., `(555) 555-5555`). Save.

Run another scan. Verify that the "Fact Check" section now shows an "incorrect" flag for the phone field, displaying "AI said: (619) 226-6333" vs "Correct: (555) 555-5555."

Restore the correct phone number afterward.

- [ ] **Step 5: Test graceful skip without ground truth**

Create or find a business with no ground truth. Run a scan. Verify:
- No hallucination flags are generated
- "Fact Check" shows the prompt to add business facts
- No errors in the browser console or server logs

- [ ] **Step 6: Deploy to Vercel**

```bash
vercel --prod
```

Verify the deployed app works with hallucination detection enabled. Check that the cron route still functions (Vercel dashboard > Cron Jobs should show no errors).
