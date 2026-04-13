You are producing implementation-ready specs for the Foundation phase of the GEO scanning tool. Read docs/research-phase-1.md for prior findings. Write output to docs/research-phase-2.md.

## Scope

Cover 3 areas:

### AREA 1: Clerk Auth Integration

Run npm install @clerk/nextjs first. Then read node_modules/@clerk/nextjs to learn the actual current API surface. Do not rely on training data for Clerk APIs.

Produce exact file contents for:
- src/middleware.ts — route protection
- src/app/sign-in/[[...sign-in]]/page.tsx — Clerk sign-in page
- src/app/sign-up/[[...sign-up]]/page.tsx — Clerk sign-up page
- src/lib/auth.ts — helper to check user access to a business

Also produce:
- SQL migration for user_business_access table
- Route protection matching Phase 1 section 3 auth map
- Roles: admin sees all, editor sees assigned businesses and can scan, viewer sees assigned businesses read-only

### AREA 2: Automated Scanning via Vercel Cron

Read src/lib/scanner/index.ts and its scanBusiness function.

Produce cron route at src/app/api/cron/scan/route.ts with:
- Error isolation per business — one failure must not stop the batch
- Batching strategy that handles more than 8 businesses within Vercel 300s function timeout
- Rate limiting respecting Anthropic 50 RPM free-tier limit
- CRON_SECRET auth header verification
- SQL migration for scan_logs table
- Vercel cron config for weekly Monday 6am UTC

### AREA 3: Visibility Score Aggregation

Read the existing visibility_scores table in supabase/001_initial_schema.sql.

Produce:
- An aggregation function that populates visibility_scores after each scan cycle, grouped by platform
- Wire it into both the new cron route and the existing manual scan flow in src/app/api/scan/route.ts
- Ensure the existing dashboard at src/app/page.tsx renders the data without changes

## Self-Learning Protocol

Maintain three structures in the output doc:

### A: Status Block

At the top of the doc. 4 lines max. Contains: current iteration number, depth level which is Explore or Build or Harden, current focus area, any blockers. Rewrite this completely each iteration.

### B: Learning Journal

At the bottom of the doc. Append one entry per iteration. Each entry has exactly 4 tagged lines:
- DISCOVERY: what you learned this iteration
- APPROACH CHANGE: what you are doing differently based on what you learned
- DEPTH REACHED: whether this iteration was Explore, Build, or Harden depth
- NEXT: what to focus on next iteration

Read the entire journal before starting each iteration so you build on prior learning.

### C: Adaptive Scorecard

At the bottom of the doc after the journal. Rewrite each iteration. Score each of the 3 areas 1-5 using criteria that match your current depth level:

- Explore depth: score on "did I read actual source code" and "did I identify open questions"
- Build depth: score on "could a developer copy-paste this" and "does it handle edge cases"
- Harden depth: score on "would this survive code review" and "are error paths covered"

Soft depth targets: iterations 1-3 aim for Explore, 4-7 aim for Build, 8-10 aim for Harden. But follow your own judgment from the journal on pacing. If something needs more exploration, stay in Explore longer.

Fix the lowest-scoring sections first each iteration.

## Completion Criteria

Only declare PHASE2_COMPLETE when ALL of these are true:
- All 3 sections score 4 or higher on the active depth criteria
- Zero open questions remain
- Every file spec is copy-pasteable, not pseudocode
- SQL migrations are ready to run
- The learning journal contains at least one genuine approach change
