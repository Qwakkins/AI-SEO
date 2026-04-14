---
active: true
iteration: 2
max_iterations: 5
completion_promise: "PHASE2_COMPLETE"
started_at: "2026-04-13T00:00:00Z"
---

You are in the HARDEN phase of a self-learning research loop. Read docs/research-phase-2.md — it contains implementation specs from iterations 1-3. Read the Learning Journal and Adaptive Scorecard at the bottom to understand what has been done. Your job is NOT to rewrite — it is to HARDEN the existing spec by finding and fixing weaknesses. Each iteration, you MUST: 1. Re-read docs/research-phase-2.md fully. 2. Pick the weakest area from the scorecard. 3. Do targeted verification by reading actual source files. 4. Update the spec with fixes, not rewrites. 5. Append a new Learning Journal entry. 6. Rewrite the Adaptive Scorecard with Harden criteria: survives code review, error paths covered. Specific items from iteration 3 journal to verify: A. Does auth return the same session in API routes as in middleware — read node_modules/@clerk/nextjs to confirm. B. Should scan_logs capture manual scans too — update the manual scan route if yes. C. Verify Supabase upsert actually needs the unique constraint or if ignoreDuplicates works. D. The dashboard overallRate averages ALL scores across dates not just latest — fix or document clearly. E. Verify all TypeScript import paths are correct against the real file structure. When ALL areas score 5/5 on Harden criteria and you have verified the items above, output the completion promise.
