You are researching and designing the next phase of an existing GEO (Generative Engine Optimization) scanning tool. The app is a Next.js project deployed on Vercel that monitors how AI models describe local businesses.

## What Already Exists

This repo already has a working MVP with:
- Scanner engine (src/lib/scanner/) that queries ChatGPT and Claude APIs, with stubs for Gemini and Perplexity
- Mention detection (src/lib/scanner/analyzer.ts) using exact string matching, sentence-level context extraction, and competitor name extraction
- Supabase database with tables: businesses, tracking_queries, query_results, visibility_scores
- Dashboard (src/app/page.tsx) showing businesses with per-platform mention rates
- Business detail page (src/app/business/[id]/page.tsx) with manual scan button, results table, expandable responses
- API routes for CRUD operations and scanning

DO NOT redesign or rebuild what already works. Your job is to research and design what's MISSING.

## Who This Is For

A web designer who builds websites and manages social media for local businesses. This tool gives him an edge by showing clients how AI talks about them and fixing issues. He may sell this as a SaaS product later.

## Pilot Businesses
- A hauling & demolition company with ZERO digital presence (no LLC, no Yelp, no Google Business Profile, no website yet)
- A sign maker for restaurants (niche B2B local business)
- Businesses are located in different cities

## Tech Stack (Already In Use)
- Next.js (App Router) on Vercel
- Supabase (Postgres) — already connected and working
- OpenAI API (ChatGPT) + Anthropic API (Claude) for scanning
- Tailwind CSS for styling
- May add Perplexity and Gemini APIs later
- Adding: Clerk for authentication (free tier)
- Adding: Vercel cron for automated weekly scans

## Research Tasks

Complete ALL of the following. Read the existing code first to understand what's built, then document your research and designs thoroughly.

### 1. Hallucination Detection Design (HIGHEST PRIORITY)
- Read the existing analyzer at src/lib/scanner/analyzer.ts — it only does mention detection today
- Design the ground truth data model: what verified facts should be stored per business?
  - Hours, address, phone, services, pricing, specialties, service area, etc.
- Design the matching strategy for comparing AI responses against ground truth:
  - Which fields can be exact-matched? (phone, address)
  - Which need fuzzy matching? (business name variations, service descriptions)
  - Which need LLM-as-judge? (subjective claims, nuanced descriptions)
- How to handle subjective claims (best in the city, affordable)
- How to handle outdated info vs factually wrong info
- Estimate accuracy expectations per field type
- Design the database changes needed (new tables or columns in Supabase)
- Design how hallucination flags surface in the existing dashboard UI

### 2. Minimum Digital Presence Requirements
- Research: what is the minimum digital footprint a local business needs before AI models will mention them?
  - Google Business Profile? Website? Reviews? Social media? Directory listings?
- For a business with ZERO presence (like the hauling client), what steps are needed and in what order to become visible to AI?
- What structured data / schema markup matters most for AI visibility?
- How long does it typically take after establishing presence before AI models pick it up?
- This is critical because the tool owner also builds websites and social media — this research becomes his remediation playbook for clients

### 3. Clerk Auth Integration Design
- Design the Clerk integration for multi-tenant access
- How to link Clerk users to Supabase business records
- Role design: admin (sees all businesses) vs client (sees only their own)
- Which existing pages/routes need auth protection
- How to handle the onboarding flow for new client users

### 4. Automated Scanning (Vercel Cron)
- Design the cron job flow: Vercel cron -> API route -> scan all active businesses -> store results
- How to populate the existing visibility_scores table with aggregated data after each scan cycle
- Frequency recommendations: weekly? daily? configurable per client?
- Error handling: what happens if one business scan fails mid-cycle?
- Rate limiting: how to avoid hitting API rate limits when scanning multiple businesses

### 5. Improved Mention Detection
- Review the existing analyzer at src/lib/scanner/analyzer.ts
- The current approach is exact string matching only — design improvements:
  - Fuzzy matching for misspellings and name variations
  - Confidence scoring (definite mention vs possible mention vs not mentioned)
  - Better competitor extraction logic
- Should any of this use an LLM call for more accurate parsing?

### 6. Scanning Prompt Engineering
- Design template prompts optimized for surfacing local business recommendations
- Create prompt variants for different business types (service businesses like hauling vs B2B like sign makers)
- Design prompts that elicit specific, factual responses to make hallucination detection easier
- Test how geographic specificity affects results (city vs neighborhood vs zip code)
- How many prompt variations per business per scan cycle?

### 7. API Cost Modeling
- Calculate cost per scan using current OpenAI and Anthropic pricing
- Model costs at: 3 clients, 10 clients, 50 clients, 100 clients
- Factor in: queries per client, models per query, scan frequency, plus hallucination detection LLM calls if using LLM-as-judge
- Determine break-even: at what client count and pricing does revenue cover API costs?

### 8. Trend Tracking & Dashboard Enhancements
- The visibility_scores table exists but is never populated — design the aggregation logic
- Design trend charts: what should clients see over time?
- Design how hallucination alerts appear in the existing dashboard
- Should there be email/notification alerts for critical issues (new hallucination detected, visibility dropped)?

### 9. Competitor Teardown
For each of these tools, do a real teardown — not a summary, a feature-by-feature breakdown:
- **Semrush AI Visibility** — what does it actually track? What AI models? What reporting? Pricing?
- **AthenaHQ** — what's their angle? Enterprise vs SMB? What do they miss for local businesses?
- **Otterly** — features, pricing, who it's built for, what it doesn't do
- **Scrunch AI** — same breakdown
- **Geoptie** — same breakdown
- **Any others found during research** — BrightLocal AI, Whitespark, etc.

For each competitor document:
- Target market (enterprise, agency, SMB, local)
- AI models they monitor
- Do they detect hallucinations or just track mentions?
- Do they handle local/service-area businesses or just brands?
- Pricing tiers and what's included
- Biggest gaps — what do they NOT do that local businesses need?

### 10. Feasibility & Differentiation Matrix
Based on everything from sections 1-9, build a decision matrix:
- List every feature gap found across competitors
- For each gap, score: implementation effort (1-5), revenue impact (1-5), differentiation value (1-5)
- Which gaps are unique to a local-first, hallucination-detecting tool?
- Which gaps are table stakes (must-have to compete) vs genuine differentiators?
- For the tool owner who builds websites and manages social media — which features directly feed his existing services?
- Final recommendation: what 3-5 features to build first that competitors don't have and that local businesses will pay for
- What features to explicitly NOT build (and why — cost, complexity, already commoditized)

## Output Requirements

Write your findings to a file called docs/research-phase-1.md in this repo. Cover all 10 areas with:
- Findings and evidence for each research area
- Design decisions with rationale
- SQL for any new/modified Supabase tables
- Updated file structure showing new files needed
- A prioritized build order (what to implement first)
- Risk register: what could go wrong and how to mitigate

Output RESEARCH_COMPLETE when you have thoroughly documented all 10 areas.
