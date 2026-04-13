---
active: true
iteration: 1
max_iterations: 10
completion_promise: "PHASE2_COMPLETE"
started_at: "2026-04-13T00:00:00Z"
---

Read docs/research-brief-phase-2.md for full context. Write implementation-ready specs to docs/research-phase-2.md covering 3 areas: Clerk Auth Integration, Automated Scanning via Vercel Cron, and Visibility Score Aggregation. IMPORTANT: Also read the existing code at src/lib/scanner/index.ts, src/lib/scanner/analyzer.ts, src/lib/scanner/platforms/chatgpt.ts, src/lib/scanner/platforms/claude.ts, supabase/001_initial_schema.sql, src/app/page.tsx, src/app/business/[id]/page.tsx, src/app/api/scan/route.ts so your specs reference real interfaces and table schemas, not guesses. For Clerk, run npm install @clerk/nextjs first then read node_modules/@clerk/nextjs to learn the actual API surface instead of relying on training data. Each section must include: exact copy-pasteable file contents, SQL migrations ready to run, edge cases and error handling, and open questions that shrink each iteration. SELF-LEARNING PROTOCOL: Maintain a Status Block at the top with iteration number and depth level, a Learning Journal at the bottom with DISCOVERY and APPROACH CHANGE and DEPTH REACHED and NEXT tags per iteration, and an Adaptive Scorecard that shifts criteria by depth. Explore scores on reading real source and finding open questions. Build scores on copy-pasteable code and edge cases. Harden scores on code review readiness and error paths. Soft targets: iterations 1-3 Explore, 4-7 Build, 8-10 Harden. Read your journal before each iteration and adjust your approach based on what you learned. Fix lowest-scoring sections first.
