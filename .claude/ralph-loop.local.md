---
active: true
iteration: 1
session_id: 
max_iterations: 10
completion_promise: "RESEARCH_COMPLETE"
started_at: "2026-04-12T11:25:20Z"
---

Read docs/research-brief.md for full context. Write findings to docs/research-phase-1.md covering 10 areas: 1. Hallucination Detection Design 2. Minimum Digital Presence Requirements 3. Clerk Auth Integration 4. Automated Scanning via Vercel Cron 5. Improved Mention Detection 6. Scanning Prompt Engineering 7. API Cost Modeling 8. Trend Tracking and Dashboard Enhancements 9. Competitor Teardown with feature-by-feature breakdown of Semrush AI Visibility, AthenaHQ, Otterly, Scrunch, Geoptie and others 10. Feasibility and Differentiation Matrix scoring each competitor gap on effort vs impact vs differentiation, recommend top 3-5 features to build that competitors miss, and what to explicitly skip. IMPORTANT: Also read the existing code at src/lib/scanner/analyzer.ts, src/lib/scanner/index.ts, src/lib/scanner/platforms/chatgpt.ts, src/lib/scanner/platforms/claude.ts, supabase/001_initial_schema.sql, src/app/page.tsx, src/app/business/[id]/page.tsx, src/app/api/scan/route.ts so your designs reference real interfaces and table schemas, not guesses. Each section must include concrete design decisions with rationale, SQL for new or modified Supabase tables where applicable, file paths for new files needed. The doc must end with a prioritized build order, an updated file structure tree, and a risk register with at least 5 entries. SELF-CHECK EACH ITERATION: After writing, re-read docs/research-phase-1.md and score each section 1-5 on a. actionable specificity b. references real code c. completeness vs docs/research-brief.md. Write a SCORECARD at the bottom of the doc with section scores and what to fix. On subsequent iterations, fix the lowest-scoring sections first. Only declare RESEARCH_COMPLETE when every section scores 4 or higher on all 3 criteria.
