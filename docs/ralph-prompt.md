# Ralph Loop Prompt — Research Phase 1

Copy the command below into Claude Code. It is a single line — do not add line breaks.

## The Command

```
/ralph-loop Read docs/research-brief.md for full context. Write findings to docs/research-phase-1.md covering 10 areas: (1) Hallucination Detection Design (2) Minimum Digital Presence Requirements (3) Clerk Auth Integration (4) Automated Scanning via Vercel Cron (5) Improved Mention Detection (6) Scanning Prompt Engineering (7) API Cost Modeling (8) Trend Tracking and Dashboard Enhancements (9) Competitor Teardown — feature-by-feature breakdown of Semrush AI Visibility, AthenaHQ, Otterly, Scrunch, Geoptie and others (10) Feasibility and Differentiation Matrix — score each competitor gap on effort vs impact vs differentiation, recommend top 3-5 features to build that competitors miss, and what to explicitly skip. IMPORTANT: Also read the existing code — src/lib/scanner/analyzer.ts, src/lib/scanner/index.ts, src/lib/scanner/platforms/chatgpt.ts, src/lib/scanner/platforms/claude.ts, supabase/001_initial_schema.sql, src/app/page.tsx, src/app/business/[id]/page.tsx, src/app/api/scan/route.ts — so your designs reference real interfaces and table schemas, not guesses. Each section must include: concrete design decisions with rationale, SQL for new or modified Supabase tables where applicable, file paths for new files needed. The doc must end with: a prioritized build order, an updated file structure tree, and a risk register with at least 5 entries. SELF-CHECK EACH ITERATION: After writing, re-read docs/research-phase-1.md and score each section 1-5 on (a) actionable specificity — could a developer implement from this alone? (b) references real code — does it name actual functions, tables, interfaces from the repo? (c) completeness — does it answer every sub-question from docs/research-brief.md? Write a SCORECARD at the bottom of the doc with section scores and what to fix. On subsequent iterations, fix the lowest-scoring sections first. Only declare RESEARCH_COMPLETE when every section scores 4 or higher on all 3 criteria. --max-iterations 10 --completion-promise RESEARCH_COMPLETE
```

## Shell Safety Notes

- **Prompt first, flags last** — matches the skill's expected format: `PROMPT [--max-iterations N] [--completion-promise TEXT]`
- **Single-word promise** (`RESEARCH_COMPLETE` not `RESEARCH COMPLETE`) — avoids quoting issues in the shell handoff
- **No angle brackets in the prompt body** — `<promise>` tags would be parsed as shell redirection. Ralph's setup script automatically tells Claude the exact promise syntax, so you don't need to include it
- **No line breaks** — the original prompt's indented multiline format caused the shell to treat `--max-iterations` as a separate command

## Why This Prompt Works for Ralph

1. **Self-verification loop**: The scorecard at the bottom gives Ralph a concrete signal — re-read, score, find gaps, fix them. Each iteration has a measurable improvement target.

2. **Objective exit criteria**: "Every section scores 4+ on all 3 criteria" — not vibes, not "looks done," but a rubric Ralph applies to its own output.

3. **Reads real code first**: Names specific files so designs reference actual interfaces (`AnalysisResult`, `ScanResult`, `businesses` table schema) instead of hallucinated APIs.

4. **Brief context reference**: Points to `docs/research-brief.md` for the full spec instead of inlining 3,000 chars of context that would break shell parsing.

5. **Fix-lowest-first strategy**: Tells Ralph which sections to prioritize on re-entry, preventing it from polishing already-good sections while weak ones stay weak.
