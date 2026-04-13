# Phase 2 Ralph Loop Design: Foundation Implementation

> Date: 2026-04-13
> Status: Approved

---

## Purpose

Design the second Ralph Loop prompt that produces implementation-ready specs for the Foundation phase of the GEO scanning tool. This loop introduces a self-learning mechanism that was absent from Phase 1.

## How Phase 1 Findings Shaped This Design

Phase 1 was a broad research sweep across 10 areas. It produced valuable designs but also revealed limitations in its own process:

| Phase 1 Finding | Impact on Phase 2 Design |
|----------------|--------------------------|
| Clerk auth design assumed training-data-era APIs | Phase 2 forces reading `node_modules` source, not relying on memorized APIs |
| 300s Vercel cron timeout limits scanning to ~8 businesses per run | Phase 2 explicitly requires a batching solution, not just a sequential loop |
| Phase 1's scorecard used the same criteria for all 10 iterations | Phase 2's scorecard adapts criteria by depth level (Explore/Build/Harden) |
| Phase 1's loop fixed content but never changed its research approach | Phase 2's learning journal tracks strategy shifts across iterations |
| Visibility score aggregation was left as pseudocode | Phase 2 requires copy-pasteable implementations, not sketches |
| API costs are negligible (~$0.046/business/scan) | No cost optimization needed — focus on correctness and reliability |
| Claude is 85% of API cost; Haiku substitution cuts 10x | Note for implementation but not a Phase 2 blocker |

## Research Scope

Three areas from Phase 1's prioritized build order (Phase 1: Foundation, Weeks 1-2):

### 1. Clerk Auth Integration

- Clerk is **not yet installed**. Ralph must run `npm install @clerk/nextjs` first, then read the installed SDK in `node_modules/@clerk/nextjs` to learn the current API surface
- Produce exact file contents for:
  - `src/middleware.ts` — route protection
  - `src/app/sign-in/[[...sign-in]]/page.tsx` — Clerk sign-in page
  - `src/app/sign-up/[[...sign-up]]/page.tsx` — Clerk sign-up page
  - `src/lib/auth.ts` — helper to check user access to a business
- SQL migration for `user_business_access` table
- Route protection matching Phase 1's auth protection map (section 3)
- Roles: admin (sees all), editor (assigned businesses, can scan), viewer (assigned businesses, read-only)

### 2. Automated Scanning (Vercel Cron)

- Read the existing `scanBusiness()` in `src/lib/scanner/index.ts`
- Produce cron route at `src/app/api/cron/scan/route.ts` with:
  - Error isolation per business (one failure doesn't stop the batch)
  - Batching strategy that handles >8 businesses within Vercel's 300s function timeout
  - Rate limiting respecting Anthropic's 50 RPM free-tier limit
  - CRON_SECRET auth header verification
- SQL migration for `scan_logs` table
- Vercel cron configuration (weekly, Monday 6am UTC)

### 3. Visibility Score Aggregation

- Read the existing `visibility_scores` table schema in `supabase/001_initial_schema.sql`
- Produce an aggregation function that populates `visibility_scores` after each scan cycle, grouped by platform
- Wire the aggregation into both:
  - The new cron route (automatic after each batch)
  - The existing manual scan flow in `src/app/api/scan/route.ts`
- Ensure the existing dashboard (`src/app/page.tsx`) will render the data without changes (it already reads `visibility_scores`)

## Self-Learning Mechanism

Phase 1's loop had a scorecard (score sections 1-5, fix lowest first). That's self-checking — it evaluates output quality but never changes its research approach. Phase 2 introduces three structures that make the loop genuinely adaptive:

### Status Block (top of output doc, rewritten each iteration)

```
## Status
- Iteration: 4/10
- Depth: Build (target: Build by iteration 4-7)
- Focus: Clerk middleware is done, cron route needs batching logic
- Blocker: Clerk SDK middleware API differs from Phase 1's design — adapting
```

3-4 lines max. Ralph reads this first to orient before working. Replaces the previous iteration's status.

### Learning Journal (bottom of output doc, appended each iteration)

```
### Iteration 3 Journal
- DISCOVERY: Clerk's auth() is async in latest SDK — Phase 1 code samples need updating
- APPROACH CHANGE: Reading node_modules/@clerk/nextjs directly instead of relying on training data
- DEPTH REACHED: Explore (still finding API surface discrepancies)
- NEXT: Start building middleware with corrected API, shift to Build depth
```

Each entry is exactly 4 tagged lines. Structured tags (DISCOVERY, APPROACH CHANGE, DEPTH REACHED, NEXT) allow quick scanning across iterations. The journal grows but each entry is compact.

### Adaptive Scorecard (bottom of output doc, rewritten each iteration)

Scorecard criteria shift based on the loop's current depth level:

| Depth Level | Iteration Target | Primary Criteria | Secondary Criteria |
|-------------|-----------------|-----------------|-------------------|
| Explore | 1-3 | "Did I read the actual source code?" / "Did I identify open questions?" | Completeness |
| Build | 4-7 | "Could a developer copy-paste this?" / "Does it handle edge cases from Explore?" | References real code |
| Harden | 8-10 | "Would this survive code review?" / "Are error paths covered?" | Test plan exists |

Ralph self-selects which criteria row to use based on the learning journal's judgment. The iteration targets are soft guides, not hard gates — if Clerk auth is more complex than expected, Ralph can stay in Explore past iteration 3.

## Output Structure

Ralph writes to `docs/research-phase-2.md`:

**Top (rewritten each iteration):**
- Status block
- Table of contents

**Three research sections (progressively refined):**
Each section follows the same internal structure:
1. Current understanding (what was read in the actual code)
2. Design decisions with rationale
3. Implementation spec (exact file contents, SQL, function signatures)
4. Edge cases and error handling
5. Open questions (shrinks over iterations)

**Bottom (grows/evolves each iteration):**
- Learning journal (appended)
- Adaptive scorecard (rewritten)

## Completion Criteria

Ralph declares `PHASE2_COMPLETE` when ALL of:
- All three sections score 4+ on the active depth-level criteria
- Zero open questions remain across all sections
- Every file spec is copy-pasteable (not pseudocode or sketches)
- SQL migrations are ready to run against Supabase
- The learning journal contains at least one genuine approach change (proves the loop learned, not just polished)

## The Prompt

```
/ralph-loop Read docs/research-phase-1.md for prior findings and docs/research-brief.md for project context. Write implementation-ready specs to docs/research-phase-2.md covering 3 areas: (1) Clerk Auth Integration — run npm install @clerk/nextjs first then read node_modules/@clerk/nextjs to learn the actual current API surface, produce exact middleware.ts, sign-in page, sign-up page, auth helper, user_business_access SQL migration, and route protection matching Phase 1's auth map (2) Automated Scanning via Vercel Cron — read src/lib/scanner/index.ts and its scanBusiness() function, produce cron route at api/cron/scan with error isolation per business, a batching strategy that handles >8 businesses within Vercel's 300s timeout, rate limiting respecting Anthropic's 50 RPM limit, and scan_logs SQL migration (3) Visibility Score Aggregation — read the existing visibility_scores table in supabase/001_initial_schema.sql, produce an aggregation function that populates it after each scan cycle grouped by platform, and wire it into both the cron route and the existing manual scan flow in src/app/api/scan/route.ts. SELF-LEARNING PROTOCOL: Maintain three structures at the bottom of the doc. (A) Status Block at the top — 4 lines max: current iteration, depth level (Explore/Build/Harden), current focus, blockers. Rewrite each iteration. (B) Learning Journal — append one entry per iteration with exactly 4 tagged lines: DISCOVERY (what you learned), APPROACH CHANGE (what you're doing differently), DEPTH REACHED (Explore/Build/Harden), NEXT (focus for next iteration). (C) Adaptive Scorecard — score each section 1-5 using criteria that match your current depth: Explore phase scores on "read actual source" and "identified open questions", Build phase scores on "copy-pasteable implementation" and "handles edge cases", Harden phase scores on "survives code review" and "error paths covered". Soft depth targets: iterations 1-3 Explore, 4-7 Build, 8-10 Harden, but follow your journal's judgment on pacing. Fix lowest-scoring sections first each iteration. Only declare PHASE2_COMPLETE when all sections score 4+ on active criteria, zero open questions remain, every file spec is copy-pasteable not pseudocode, SQL is ready to run, and the journal shows at least one genuine approach change. --max-iterations 10 --completion-promise PHASE2_COMPLETE
```

## Shell Safety Notes (carried from Phase 1)

- **Prompt first, flags last** — matches Ralph's expected format
- **Single-word promise** (`PHASE2_COMPLETE`) — avoids quoting issues
- **No angle brackets** — would be parsed as shell redirection
- **No line breaks** — single-line command
