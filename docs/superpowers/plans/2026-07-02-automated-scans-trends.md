# Automated Weekly Scans + Trend Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated weekly AI-visibility scans for all businesses via Vercel cron, with aggregated `visibility_scores` populated after every scan and a mention-rate trend chart on the business detail page.

**Architecture:** A cron-protected API route loops all businesses sequentially, reusing the existing `scanBusiness()` unchanged. A new pure aggregation function turns scan results into per-platform score rows inserted into the existing `visibility_scores` table (one row per platform per scan day). The manual scan route calls the same aggregation so charts never go stale. The business detail page renders a recharts line chart from `visibility_scores`.

**Tech Stack:** Next.js 16 (App Router), Supabase JS, Vercel Cron, recharts, vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-automated-scans-trends-design.md`

**Repo root:** `C:\Users\steve\Downloads\backups\AI-SEO` — all paths below are relative to it. Run all commands from the repo root.

**Context for the implementer:**
- `scanBusiness(businessId)` in `src/lib/scanner/index.ts` already queries ChatGPT/Claude, writes raw rows to `query_results`, and returns `ScanResult[]` where each item has `platform`, `business_mentioned` (boolean), and `position_in_response` (number | null).
- The `visibility_scores` table already exists (see `supabase/001_initial_schema.sql`): columns `business_id`, `platform`, `period_start` (date), `period_end` (date), `total_queries`, `times_mentioned`, `mention_rate`, `avg_position`, `created_at`. No schema changes in this plan.
- The dashboard (`src/app/page.tsx`) already reads `visibility_scores` off the businesses list response — it will start showing data automatically once rows exist. It takes the FIRST score it sees per platform as "latest", so the list API must order scores newest-first (Task 6).
- Environment: `CRON_SECRET` must be set in `.env.local` and in Vercel project settings. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron requests when that env var exists.

---

### Task 1: Dependencies and test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install recharts
npm install -D vitest
```
Expected: both succeed, `package.json` gains `recharts` under dependencies and `vitest` under devDependencies.

- [ ] **Step 2: Add test script**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 3: Create vitest config with the `@/` path alias**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

- [ ] **Step 4: Verify vitest runs**

Run: `npm test`
Expected: exits with "No test files found" (non-zero exit is fine at this point).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add recharts and vitest"
```

---

### Task 2: Pure aggregation function (TDD)

**Files:**
- Create: `src/lib/scanner/aggregate.ts`
- Test: `src/lib/scanner/aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scanner/aggregate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeVisibilityScores } from "./aggregate";

describe("computeVisibilityScores", () => {
  it("returns empty array for no results", () => {
    expect(computeVisibilityScores([])).toEqual([]);
  });

  it("groups results by platform and computes mention rate", () => {
    const scores = computeVisibilityScores([
      { platform: "chatgpt", business_mentioned: true, position_in_response: 1 },
      { platform: "chatgpt", business_mentioned: false, position_in_response: null },
      { platform: "claude", business_mentioned: true, position_in_response: 3 },
      { platform: "claude", business_mentioned: true, position_in_response: 5 },
    ]);

    const chatgpt = scores.find((s) => s.platform === "chatgpt");
    const claude = scores.find((s) => s.platform === "claude");

    expect(chatgpt).toEqual({
      platform: "chatgpt",
      total_queries: 2,
      times_mentioned: 1,
      mention_rate: 0.5,
      avg_position: 1,
    });
    expect(claude).toEqual({
      platform: "claude",
      total_queries: 2,
      times_mentioned: 2,
      mention_rate: 1,
      avg_position: 4,
    });
  });

  it("ignores null positions when averaging", () => {
    const scores = computeVisibilityScores([
      { platform: "chatgpt", business_mentioned: true, position_in_response: 2 },
      { platform: "chatgpt", business_mentioned: true, position_in_response: null },
    ]);
    expect(scores[0].avg_position).toBe(2);
  });

  it("returns null avg_position when no positions exist", () => {
    const scores = computeVisibilityScores([
      { platform: "chatgpt", business_mentioned: false, position_in_response: null },
    ]);
    expect(scores[0].avg_position).toBeNull();
    expect(scores[0].mention_rate).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./aggregate` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/lib/scanner/aggregate.ts`:
```ts
export interface ResultRow {
  platform: string;
  business_mentioned: boolean;
  position_in_response: number | null;
}

export interface PlatformScore {
  platform: string;
  total_queries: number;
  times_mentioned: number;
  mention_rate: number;
  avg_position: number | null;
}

export function computeVisibilityScores(results: ResultRow[]): PlatformScore[] {
  const byPlatform = new Map<string, ResultRow[]>();
  for (const r of results) {
    const rows = byPlatform.get(r.platform) ?? [];
    rows.push(r);
    byPlatform.set(r.platform, rows);
  }

  return [...byPlatform.entries()].map(([platform, rows]) => {
    const mentioned = rows.filter((r) => r.business_mentioned);
    const positions = rows
      .map((r) => r.position_in_response)
      .filter((p): p is number => p !== null);
    return {
      platform,
      total_queries: rows.length,
      times_mentioned: mentioned.length,
      mention_rate: mentioned.length / rows.length,
      avg_position:
        positions.length > 0
          ? positions.reduce((sum, p) => sum + p, 0) / positions.length
          : null,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scanner/aggregate.ts src/lib/scanner/aggregate.test.ts
git commit -m "feat: add visibility score aggregation"
```

---

### Task 3: Persist scores to Supabase

**Files:**
- Modify: `src/lib/scanner/aggregate.ts`

- [ ] **Step 1: Add the save function**

Append to `src/lib/scanner/aggregate.ts`:
```ts
import { getSupabase } from "@/lib/supabase";

export async function saveVisibilityScores(
  businessId: string,
  scores: PlatformScore[]
): Promise<void> {
  if (scores.length === 0) return;
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  const today = new Date().toISOString().slice(0, 10);

  // Re-scanning the same day replaces that day's rows instead of duplicating them
  const { error: deleteError } = await supabase
    .from("visibility_scores")
    .delete()
    .eq("business_id", businessId)
    .eq("period_start", today);
  if (deleteError) throw new Error(deleteError.message);

  const rows = scores.map((s) => ({
    business_id: businessId,
    platform: s.platform,
    period_start: today,
    period_end: today,
    total_queries: s.total_queries,
    times_mentioned: s.times_mentioned,
    mention_rate: s.mention_rate,
    avg_position: s.avg_position,
  }));

  const { error } = await supabase.from("visibility_scores").insert(rows);
  if (error) throw new Error(error.message);
}
```
The `import` line goes at the top of the file with a blank line before the existing interfaces.

- [ ] **Step 2: Verify existing tests still pass and the app typechecks**

Run: `npm test`
Expected: 4 tests PASS (importing the module must not require a live DB).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scanner/aggregate.ts
git commit -m "feat: persist visibility scores to supabase"
```

---

### Task 4: Cron scan-all route + Vercel cron config

**Files:**
- Create: `src/app/api/cron/scan/route.ts`
- Create: `vercel.json`
- Modify: `.env.local` (add `CRON_SECRET` — do NOT commit this file)

- [ ] **Step 1: Create the cron route**

Create `src/app/api/cron/scan/route.ts`:
```ts
import { scanBusiness } from "@/lib/scanner";
import {
  computeVisibilityScores,
  saveVisibilityScores,
} from "@/lib/scanner/aggregate";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let scanned = 0;
  const errors: { business: string; error: string }[] = [];

  for (const biz of businesses ?? []) {
    try {
      const results = await scanBusiness(biz.id);
      const scores = computeVisibilityScores(results);
      await saveVisibilityScores(biz.id, scores);
      scanned++;
    } catch (err) {
      errors.push({
        business: biz.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ scanned, failed: errors.length, errors });
}
```

- [ ] **Step 2: Create the Vercel cron config**

Create `vercel.json`:
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
(Monday 06:00 UTC, weekly.)

- [ ] **Step 3: Add CRON_SECRET locally**

Append to `.env.local` (generate a random value; this file is gitignored):
```
CRON_SECRET=<random-32-char-string>
```
Generate one with: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`

- [ ] **Step 4: Verify auth rejection manually**

Run: `npm run dev` (in background), then:
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/cron/scan" -SkipHttpErrorCheck | Select-Object StatusCode
```
Expected: `401`.

- [ ] **Step 5: Verify a real scan run**

```powershell
$secret = (Get-Content .env.local | Select-String "CRON_SECRET=").ToString().Split("=")[1]
Invoke-WebRequest -Uri "http://localhost:3000/api/cron/scan" -Headers @{ Authorization = "Bearer $secret" } | Select-Object -ExpandProperty Content
```
Expected: JSON like `{"scanned":N,"failed":0,"errors":[]}` after a few minutes (makes real OpenAI/Anthropic API calls, ~$0.10-0.30). Then confirm rows exist: check the `visibility_scores` table in the Supabase dashboard, or temporarily hit `/api/businesses` and confirm `visibility_scores` arrays are non-empty.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/scan/route.ts vercel.json
git commit -m "feat: weekly automated scan-all via Vercel cron"
```

---

### Task 5: Manual scans also aggregate

**Files:**
- Modify: `src/app/api/scan/route.ts`

- [ ] **Step 1: Hook aggregation into the manual scan route**

Replace the full contents of `src/app/api/scan/route.ts` with:
```ts
import { scanBusiness } from "@/lib/scanner";
import {
  computeVisibilityScores,
  saveVisibilityScores,
} from "@/lib/scanner/aggregate";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json();
  const { business_id } = body;

  if (!business_id) {
    return Response.json({ error: "business_id is required" }, { status: 400 });
  }

  try {
    const results = await scanBusiness(business_id);

    try {
      await saveVisibilityScores(business_id, computeVisibilityScores(results));
    } catch (aggErr) {
      // Raw query_results are already saved; a failed aggregation shouldn't fail the scan
      console.error("Aggregation failed:", aggErr);
    }

    return Response.json({
      total_queries: results.length,
      mentioned_count: results.filter((r) => r.business_mentioned).length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify manually**

With the dev server running, click "Run Scan" (or "Scan Again") on a business detail page at `http://localhost:3000/business/<id>`. After it completes, confirm a fresh `visibility_scores` row for today exists (Supabase dashboard, or `/api/businesses/<id>` response).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scan/route.ts
git commit -m "feat: aggregate visibility scores after manual scans"
```

---

### Task 6: Order embedded scores newest-first in the businesses list API

**Files:**
- Modify: `src/app/api/businesses/route.ts`

The dashboard takes the first score it encounters per platform as "latest" (`src/app/page.tsx:61-66`), but the list query never orders the embedded `visibility_scores`. Fix the ordering.

- [ ] **Step 1: Add embedded ordering**

In `src/app/api/businesses/route.ts`, change the GET query from:
```ts
  const { data, error } = await supabase
    .from("businesses")
    .select("*, visibility_scores(*)")
    .order("created_at", { ascending: false });
```
to:
```ts
  const { data, error } = await supabase
    .from("businesses")
    .select("*, visibility_scores(*)")
    .order("created_at", { ascending: false })
    .order("period_start", {
      referencedTable: "visibility_scores",
      ascending: false,
    });
```

- [ ] **Step 2: Verify manually**

With the dev server running, open `http://localhost:3000` — business cards should show a mention-rate percentage and colored platform badges (populated by Task 4/5 scans) instead of "No scans yet".

- [ ] **Step 3: Commit**

```bash
git add src/app/api/businesses/route.ts
git commit -m "fix: order embedded visibility scores newest-first"
```

---

### Task 7: Trend chart on the business detail page

**Files:**
- Create: `src/components/TrendChart.tsx`
- Modify: `src/app/business/[id]/page.tsx`

- [ ] **Step 1: Create the chart component**

Create `src/components/TrendChart.tsx`:
```tsx
"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface VisibilityScore {
  platform: string;
  mention_rate: number;
  period_start: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt: "#10a37f",
  claude: "#d97706",
  gemini: "#4285f4",
  perplexity: "#22b8cf",
};

export default function TrendChart({ scores }: { scores: VisibilityScore[] }) {
  const byDate = new Map<string, Record<string, number | string>>();
  const platforms = new Set<string>();

  for (const s of scores) {
    platforms.add(s.platform);
    const row = byDate.get(s.period_start) ?? { date: s.period_start };
    row[s.platform] = Math.round(Number(s.mention_rate) * 100);
    byDate.set(s.period_start, row);
  }

  const data = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  if (data.length < 2) {
    return (
      <p className="text-sm text-gray-400 bg-white border border-gray-200 rounded-lg p-4">
        Not enough data yet — trends appear after your second scan.
      </p>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 12 }}
          />
          <Tooltip formatter={(value) => `${value}%`} />
          <Legend />
          {[...platforms].map((p) => (
            <Line
              key={p}
              type="monotone"
              dataKey={p}
              stroke={PLATFORM_COLORS[p] ?? "#8884d8"}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Render it on the business detail page**

In `src/app/business/[id]/page.tsx`:

a. Add the import at the top (after the existing imports):
```tsx
import TrendChart, { VisibilityScore } from "@/components/TrendChart";
```

b. Add `visibility_scores` to the `Business` interface:
```tsx
interface Business {
  id: string;
  name: string;
  location: string;
  category: string;
  website_url: string | null;
  tracking_queries: { id: string; query_template: string; is_active: boolean }[];
  visibility_scores: VisibilityScore[];
}
```
(The `/api/businesses/[id]` route already returns `visibility_scores` ordered by `period_start` descending — no API change needed.)

c. Insert a "Visibility Trend" section immediately BEFORE the `{/* Platform Summary */}` comment block:
```tsx
      {/* Visibility Trend */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Visibility Trend</h2>
        <TrendChart scores={business.visibility_scores ?? []} />
      </div>
```

d. In `runScan()`, after the existing results refresh (the `const refreshed = ...` lines), also refresh the business so the chart updates:
```tsx
    const refreshedBiz = await fetch(`/api/businesses/${id}`).then((r) =>
      r.json()
    );
    setBusiness(refreshedBiz);
```

- [ ] **Step 3: Verify in the browser**

With the dev server running, open a business detail page:
- With 0-1 scan days recorded: "Not enough data yet" message renders.
- To see the chart with 2+ points without waiting a week: in the Supabase dashboard (Table Editor → visibility_scores), duplicate one of the rows created earlier and set its `period_start`/`period_end` to yesterday's date. Reload — a multi-line chart should render with one point per date, y-axis 0-100%.
- Run a manual scan and confirm the chart refreshes without a page reload.
- Delete the fabricated test row afterward.

- [ ] **Step 4: Commit**

```bash
git add src/components/TrendChart.tsx "src/app/business/[id]/page.tsx"
git commit -m "feat: visibility trend chart on business detail page"
```

---

### Task 8: Final verification and deploy prep

**Files:** none created — verification only.

- [ ] **Step 1: Full check suite**

Run:
```bash
npm test
npm run lint
npm run build
```
Expected: tests pass, no lint errors, production build succeeds.

- [ ] **Step 2: Manual end-to-end pass**

With `npm run dev`:
1. Dashboard (`/`) shows mention rates and platform badges on business cards.
2. Business detail shows the Visibility Trend section.
3. `Invoke-WebRequest` on `/api/cron/scan` with the Bearer secret returns `{"scanned":..,"failed":0,...}`.
4. Without the header: 401.

- [ ] **Step 3: Deploy checklist (user action required)**

Remind the user to:
1. Set `CRON_SECRET` in Vercel → Project → Settings → Environment Variables (same value as `.env.local` or a new one).
2. Deploy (push to the connected branch or `vercel deploy`). The cron appears under Project → Settings → Cron Jobs after deploy.
3. Optionally trigger the cron once from the Vercel dashboard to confirm production works.

- [ ] **Step 4: Commit any stragglers**

```bash
git status
```
Expected: clean tree (everything committed in Tasks 1-7).
