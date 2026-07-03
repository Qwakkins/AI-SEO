# Ralph Loop Prompt — Research Phase 2 (Foundation Implementation)

Copy the command below into Claude Code. It is a single line — do not add line breaks.

## The Command

```
/ralph-loop Read docs/research-phase-1.md for prior findings and docs/research-brief.md for project context. Write implementation-ready specs to docs/research-phase-2.md covering 3 areas: (1) Clerk Auth Integration — run npm install @clerk/nextjs first then read node_modules/@clerk/nextjs to learn the actual current API surface, produce exact middleware.ts, sign-in page, sign-up page, auth helper, user_business_access SQL migration, and route protection matching Phase 1's auth map (2) Automated Scanning via Vercel Cron — read src/lib/scanner/index.ts and its scanBusiness() function, produce cron route at api/cron/scan with error isolation per business, a batching strategy that handles >8 businesses within Vercel's 300s timeout, rate limiting respecting Anthropic's 50 RPM limit, and scan_logs SQL migration (3) Visibility Score Aggregation — read the existing visibility_scores table in supabase/001_initial_schema.sql, produce an aggregation function that populates it after each scan cycle grouped by platform, and wire it into both the cron route and the existing manual scan flow in src/app/api/scan/route.ts. SELF-LEARNING PROTOCOL: Maintain three structures at the bottom of the doc. (A) Status Block at the top — 4 lines max: current iteration, depth level (Explore/Build/Harden), current focus, blockers. Rewrite each iteration. (B) Learning Journal — append one entry per iteration with exactly 4 tagged lines: DISCOVERY (what you learned), APPROACH CHANGE (what you're doing differently), DEPTH REACHED (Explore/Build/Harden), NEXT (focus for next iteration). (C) Adaptive Scorecard — score each section 1-5 using criteria that match your current depth: Explore phase scores on "read actual source" and "identified open questions", Build phase scores on "copy-pasteable implementation" and "handles edge cases", Harden phase scores on "survives code review" and "error paths covered". Soft depth targets: iterations 1-3 Explore, 4-7 Build, 8-10 Harden, but follow your journal's judgment on pacing. Fix lowest-scoring sections first each iteration. Only declare PHASE2_COMPLETE when all sections score 4+ on active criteria, zero open questions remain, every file spec is copy-pasteable not pseudocode, SQL is ready to run, and the journal shows at least one genuine approach change. --max-iterations 10 --completion-promise PHASE2_COMPLETE
```

## What's New vs Phase 1

### Self-Learning Protocol
Phase 1 had a static scorecard — same criteria all 10 iterations. Phase 2 introduces:

1. **Status Block** — 4-line orientation at the top, rewritten each iteration. Tells Ralph where it is and what's blocking progress.

2. **Learning Journal** — Appended each iteration with 4 structured tags (DISCOVERY, APPROACH CHANGE, DEPTH REACHED, NEXT). Ralph reads this before starting work, so each iteration builds on what was learned — not just what was written.

3. **Adaptive Scorecard** — Criteria shift by depth level:
   - **Explore (iterations 1-3):** "Did I read actual source?" / "Open questions identified?"
   - **Build (iterations 4-7):** "Copy-pasteable?" / "Edge cases handled?"
   - **Harden (iterations 8-10):** "Survives code review?" / "Error paths covered?"

### Progressive Depth
Instead of all iterations optimizing for the same thing, early iterations explore (read code, find discrepancies with Phase 1's designs), middle iterations build (exact implementations), and late iterations harden (error handling, edge cases, review readiness).

### Forced Source Reading
Phase 1 relied on training data for Clerk's API. Phase 2 explicitly tells Ralph to read `node_modules/@clerk/nextjs/dist` for the actual current SDK surface.

## Shell Safety Notes

- **Single-line command** — no line breaks
- **Single-word promise** (`PHASE2_COMPLETE`) — no quoting issues
- **No angle brackets** — avoids shell redirection
- **Prompt first, flags last** — matches Ralph's expected format
