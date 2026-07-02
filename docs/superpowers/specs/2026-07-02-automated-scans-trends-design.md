# Automated Weekly Scans + Trend Charts — Design

**Date:** 2026-07-02
**Status:** Approved
**Context:** Phase 1 of replicating Otterly AI's functionality. Otterly's core loop is weekly automated brand-visibility monitoring across AI platforms with trend reporting. This phase delivers that loop. Later phases (separate specs): change detection + alerts, prompt management UI, competitive analysis UI.

## Goal

Scans currently run only when a user clicks the manual "Scan" button, and the `visibility_scores` table is never populated — so the dashboard always shows "No scans yet" and there is no historical trend data. After this phase:

1. Every business is scanned automatically once a week via Vercel cron.
2. Each scan (automated or manual) writes aggregated `visibility_scores` rows.
3. The business detail page shows a mention-rate trend chart over time.
4. Dashboard cards display real mention rates (they already read `visibility_scores`; the table was just empty).

## Scope Decisions

- **Platforms:** ChatGPT + Claude only (the two with working API keys). Gemini/Perplexity stubs unchanged.
- **Frequency:** Weekly (Monday 06:00 UTC). Cost at current scale: under $1.50/month.
- **Scale target:** Sequential scanning in a single function invocation. Fine up to ~10 businesses within Vercel's 300s limit. Fan-out per business is a deliberate non-goal until client count demands it; rework would be contained to the cron route.
- **No new database tables.** Existing `visibility_scores` schema covers everything.
- **No alerts/change detection** in this phase.

## Architecture

New files:

```
vercel.json                          — cron config: { "crons": [{ "path": "/api/cron/scan", "schedule": "0 6 * * 1" }] }
src/app/api/cron/scan/route.ts      — scan-all endpoint (GET), protected by CRON_SECRET
src/lib/scanner/aggregate.ts        — computeVisibilityScores(): pure aggregation + DB insert
src/components/TrendChart.tsx       — recharts multi-line chart (client component)
```

Modified files:

```
src/app/api/scan/route.ts           — call aggregation after manual scans so charts stay fresh
src/app/api/businesses/[id]/route.ts — include visibility_scores (ordered by period_start desc)
src/app/api/businesses/route.ts     — verify/fix score ordering (dashboard assumes newest-first)
src/app/business/[id]/page.tsx      — render TrendChart
package.json                        — add recharts; add vitest (dev)
```

### Data flow

1. Vercel cron fires weekly → `GET /api/cron/scan` with `Authorization: Bearer ${CRON_SECRET}` (Vercel sends this automatically when the env var is set).
2. Route verifies the secret (401 on mismatch), fetches all businesses.
3. For each business sequentially: call existing `scanBusiness()` unchanged → then `computeVisibilityScores()`.
4. Aggregation reads that scan run's `query_results` (filtered by `queried_at >=` run start, joined through `tracking_queries`), computes per platform: `total_queries`, `times_mentioned`, `mention_rate`, `avg_position`, and inserts one `visibility_scores` row per platform with the scan date as `period_start`/`period_end`.
5. One row per platform per week = one trend data point per week.

`maxDuration = 300` on the cron route. Current scale (~20 LLM calls/run) completes in 2–3 minutes.

### Manual scans aggregate too

The existing `/api/scan` route (manual "Scan" button) writes `query_results` but not `visibility_scores`, which would leave charts stale between cron runs. It will call the same aggregation function after scanning.

## Trend Charts UI

- **Business detail page:** recharts `LineChart`, x-axis = scan date, y-axis = mention rate (0–100%), one line per platform. Data from `visibility_scores` via the extended `/api/businesses/[id]` response. With fewer than 2 data points, show: "Not enough data yet — trends appear after your second scan."
- **Dashboard:** no card changes needed. Cards already compute overall rate and per-platform badges from `visibility_scores`. Verify the API orders scores newest-first (card logic takes first-seen per platform as latest); fix ordering if needed.

## Error Handling

- **Per-business isolation:** try/catch around each business in the cron loop; one failure doesn't stop the rest.
- **Run summary:** route returns `{ scanned, failed, errors: [...] }` — visible in Vercel cron logs without extra tooling.
- **Auth:** missing/wrong `CRON_SECRET` → 401, nothing runs.
- **Platform failures** (rate limits, outages): already handled inside `scanBusiness()`; a failed platform means no row that week and a gap in the chart.
- **Aggregation failure after a successful scan:** logged in the summary; raw `query_results` are preserved, so re-invoking the endpoint rebuilds scores.

## Testing

- **Unit tests (vitest):** aggregation math only — mention rate, avg position, per-platform grouping — as a pure function over result rows.
- **Manual verification:** seed data, invoke `/api/cron/scan` locally with the secret header, confirm `visibility_scores` rows appear, confirm charts render in the browser (business detail trend chart + dashboard cards lighting up).

## Environment

- New env var: `CRON_SECRET` (set in Vercel project settings and `.env.local`).
- New deps: `recharts` (runtime), `vitest` (dev).
