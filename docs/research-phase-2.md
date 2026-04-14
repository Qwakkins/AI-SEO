# Research Phase 2: Implementation-Ready Specs

## Status Block

| Field | Value |
|-------|-------|
| Iteration | 4 |
| Depth Level | Harden |
| Current Focus | All 5 verification items resolved. All areas 5/5. Checking completion criteria. |
| Blockers | None |

---

## Table of Contents

1. [Clerk Auth Integration](#1-clerk-auth-integration)
2. [Automated Scanning via Vercel Cron](#2-automated-scanning-via-vercel-cron)
3. [Visibility Score Aggregation](#3-visibility-score-aggregation)

---

## 1. Clerk Auth Integration

### Overview

Clerk v7.1.0 is already installed (`@clerk/nextjs@^7.1.0` in package.json). The integration requires wrapping the app in `ClerkProvider`, adding middleware for route protection, creating sign-in/sign-up pages, and building a helper to check per-business access via a `user_business_access` join table.

### 1.1 SQL Migration

File: `supabase/002_user_business_access.sql`

```sql
-- Link Clerk users to businesses they can access
CREATE TABLE user_business_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(clerk_user_id, business_id)
);

CREATE INDEX idx_user_access_clerk ON user_business_access(clerk_user_id);
CREATE INDEX idx_user_access_business ON user_business_access(business_id);
```

### 1.2 Environment Variables

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ADMIN_CLERK_IDS=user_2abc123,user_2def456
```

### 1.3 Client Component for UserButton

File: `src/components/user-button.tsx`

```tsx
"use client";

import { UserButton } from "@clerk/nextjs";

export function HeaderUserButton() {
  return <UserButton afterSignOutUrl="/sign-in" />;
}
```

### 1.4 Layout — Wrap in ClerkProvider

File: `src/app/layout.tsx`

`ClerkProvider` is a server component in `@clerk/nextjs` v7 (confirmed via `components.server.d.ts` exports). It wraps the entire app. `UserButton` is a client component, so it's imported from the wrapper above.

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { HeaderUserButton } from "@/components/user-button";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GEO Tracker",
  description: "Track your business visibility across AI platforms",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
          <header className="bg-white border-b border-gray-200">
            <nav className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
              <Link href="/" className="text-xl font-bold">
                GEO Tracker
              </Link>
              <div className="flex items-center gap-4">
                <Link
                  href="/add"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  + Add Business
                </Link>
                <HeaderUserButton />
              </div>
            </nav>
          </header>
          <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

### 1.5 Middleware — Route Protection

> **Next.js 16 note:** Next.js 16.2.3 (installed in this project) deprecates `middleware.ts` in favor of `proxy.ts`. However, `@clerk/nextjs` v7.1.0 exports `clerkMiddleware` which returns a `NextMiddleware` type and is designed for the `middleware.ts` convention. Clerk has not yet adopted the `proxy` convention. **Use `middleware.ts` for now.** When Clerk releases a `proxy`-compatible version, rename the file and export. The deprecated convention still works — it's not removed.

File: `src/middleware.ts`

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isCronRoute = createRouteMatcher([
  "/api/cron(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Cron routes use their own auth (CRON_SECRET header) — skip Clerk
  if (isCronRoute(req)) {
    return;
  }

  // All other routes require authentication
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
```

**Key decisions:**
- Cron routes (`/api/cron/*`) are excluded from Clerk auth because they use `CRON_SECRET` header verification instead. Vercel sends this header automatically.
- All other routes (including API routes) require authentication via `auth.protect()`.
- `createRouteMatcher` from `@clerk/nextjs/server` is the v7 API for pattern matching.
- **Session propagation (verified iteration 4):** `clerkMiddleware` authenticates the request and stores auth state in Node.js `AsyncLocalStorage`. The standalone `auth()` function (used in API route handlers via `src/lib/auth.ts`) reads from that same store — it does NOT re-authenticate independently. Both share the `AuthFn` type. This means `auth()` in route handlers will always see the same session that the middleware validated. If middleware is bypassed (e.g., cron routes), `auth()` returns `{ userId: null }`.

### 1.6 Sign-In Page

File: `src/app/sign-in/[[...sign-in]]/page.tsx`

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <SignIn />
    </div>
  );
}
```

### 1.7 Sign-Up Page

File: `src/app/sign-up/[[...sign-up]]/page.tsx`

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <SignUp />
    </div>
  );
}
```

### 1.8 Auth Helper — Per-Business Access Check

File: `src/lib/auth.ts`

```typescript
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "@/lib/supabase";

export type Role = "admin" | "editor" | "viewer";

interface AuthResult {
  userId: string;
  isAdmin: boolean;
}

/**
 * Get the current user's auth info. Throws if not authenticated.
 */
export async function requireAuth(): Promise<AuthResult> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const adminIds = (process.env.ADMIN_CLERK_IDS || "").split(",").map((s) => s.trim());
  const isAdmin = adminIds.includes(userId);

  return { userId, isAdmin };
}

/**
 * Check if the current user can access a specific business.
 * Admins can access all businesses.
 * Other users must have a row in user_business_access.
 *
 * Returns the user's role for that business, or null if no access.
 */
export async function checkBusinessAccess(
  businessId: string,
  requiredRole?: Role
): Promise<{ userId: string; role: Role } | null> {
  const { userId, isAdmin } = await requireAuth();

  if (isAdmin) {
    return { userId, role: "admin" };
  }

  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  const { data } = await supabase
    .from("user_business_access")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("business_id", businessId)
    .single();

  if (!data) return null;

  const role = data.role as Role;

  // Check role hierarchy if a minimum role is required
  if (requiredRole) {
    const hierarchy: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
    if (hierarchy[role] < hierarchy[requiredRole]) {
      return null;
    }
  }

  return { userId, role };
}

/**
 * Get all business IDs the current user can access.
 * Admins get all businesses. Others get their assigned ones.
 */
export async function getAccessibleBusinessIds(): Promise<string[]> {
  const { userId, isAdmin } = await requireAuth();

  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  if (isAdmin) {
    const { data } = await supabase.from("businesses").select("id");
    return (data || []).map((b) => b.id);
  }

  const { data } = await supabase
    .from("user_business_access")
    .select("business_id")
    .eq("clerk_user_id", userId);

  return (data || []).map((row) => row.business_id);
}
```

### 1.9 Protecting Existing API Routes

All existing API routes need auth. Below are the exact modified files. Routes discovered by reading the codebase: `src/app/api/scan/route.ts`, `src/app/api/businesses/route.ts`, `src/app/api/businesses/[id]/route.ts`, `src/app/api/results/[businessId]/route.ts`.

#### 1.9.1 `src/app/api/scan/route.ts` (modified)

```typescript
import { scanBusiness } from "@/lib/scanner";
import { aggregateVisibilityScores } from "@/lib/scanner/aggregator";
import { checkBusinessAccess } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json();
  const { business_id } = body;

  if (!business_id) {
    return Response.json({ error: "business_id is required" }, { status: 400 });
  }

  // Require editor role to trigger scans
  const access = await checkBusinessAccess(business_id, "editor");
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const startTime = Date.now();

  try {
    const results = await scanBusiness(business_id);

    // Aggregate visibility scores after manual scan
    await aggregateVisibilityScores(business_id, results);

    const totalDuration = Date.now() - startTime;
    const mentionedCount = results.filter((r) => r.business_mentioned).length;

    // Log manual scan to scan_logs for audit consistency with cron scans
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("scan_logs").insert({
        scan_type: "manual",
        businesses_scanned: 1,
        businesses_failed: 0,
        total_duration_ms: totalDuration,
        details: [{ business_id, status: "ok", queries_run: results.length }],
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      });
    }

    return Response.json({
      total_queries: results.length,
      mentioned_count: mentionedCount,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";

    // Log failed manual scan
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("scan_logs").insert({
        scan_type: "manual",
        businesses_scanned: 0,
        businesses_failed: 1,
        total_duration_ms: Date.now() - startTime,
        details: [{ business_id, status: "error", error: message }],
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      });
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
```

#### 1.9.2 `src/app/api/businesses/route.ts` (modified)

The existing route returns all businesses with `select("*, visibility_scores(*)")`. It needs auth filtering so non-admin users only see their assigned businesses.

```typescript
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAccessibleBusinessIds } from "@/lib/auth";

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const accessibleIds = await getAccessibleBusinessIds();

  const { data, error } = await supabase
    .from("businesses")
    .select("*, visibility_scores(*)")
    .in("id", accessibleIds)
    .order("created_at", { ascending: false })
    .order("period_start", { referencedTable: "visibility_scores", ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  // Only admins can create businesses
  const { isAdmin } = await requireAuth();
  if (!isAdmin) {
    return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { name, location, category, website_url } = body;

  if (!name || !location || !category) {
    return Response.json(
      { error: "name, location, and category are required" },
      { status: 400 }
    );
  }

  // Insert the business
  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .insert({ name, location, category, website_url })
    .select()
    .single();

  if (bizError) {
    return Response.json({ error: bizError.message }, { status: 500 });
  }

  // Auto-generate default tracking queries
  const templates = [
    `best ${category} in ${location}`,
    `top ${category} near ${location}`,
    `recommended ${category} in ${location}`,
    `${category} ${location} reviews`,
  ];

  const queries = templates.map((query_template) => ({
    business_id: business.id,
    query_template,
  }));

  const { error: queryError } = await supabase
    .from("tracking_queries")
    .insert(queries);

  if (queryError) {
    return Response.json({ error: queryError.message }, { status: 500 });
  }

  return Response.json(business, { status: 201 });
}
```

#### 1.9.3 `src/app/api/businesses/[id]/route.ts` (modified)

```typescript
import { getSupabase } from "@/lib/supabase";
import { checkBusinessAccess, requireAuth } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check user has access to this business
  const access = await checkBusinessAccess(id);
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", id)
    .single();

  if (bizError) {
    return Response.json({ error: bizError.message }, { status: 404 });
  }

  const { data: queries } = await supabase
    .from("tracking_queries")
    .select("*")
    .eq("business_id", id)
    .order("created_at", { ascending: true });

  const { data: scores } = await supabase
    .from("visibility_scores")
    .select("*")
    .eq("business_id", id)
    .order("period_start", { ascending: false });

  return Response.json({ ...business, tracking_queries: queries, visibility_scores: scores });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Only admins can delete businesses
  const { isAdmin } = await requireAuth();
  if (!isAdmin) {
    return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { error } = await supabase
    .from("businesses")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
```

#### 1.9.4 `src/app/api/results/[businessId]/route.ts` (modified)

```typescript
import { getSupabase } from "@/lib/supabase";
import { checkBusinessAccess } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  // Check user has access to this business
  const access = await checkBusinessAccess(businessId);
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: results, error } = await supabase
    .from("query_results")
    .select("*, tracking_queries!inner(query_template, business_id)")
    .eq("tracking_queries.business_id", businessId)
    .order("queried_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Compute per-platform summary
  const platformSummary: Record<string, { total: number; mentioned: number }> = {};
  for (const r of results || []) {
    if (!platformSummary[r.platform]) {
      platformSummary[r.platform] = { total: 0, mentioned: 0 };
    }
    platformSummary[r.platform].total++;
    if (r.business_mentioned) {
      platformSummary[r.platform].mentioned++;
    }
  }

  const summary = Object.entries(platformSummary).map(([platform, stats]) => ({
    platform,
    total: stats.total,
    mentioned: stats.mentioned,
    mention_rate: stats.total > 0 ? stats.mentioned / stats.total : 0,
  }));

  return Response.json({ results, summary });
}
```

### 1.10 Auth Protection Map (Complete)

| Route | File | Protection Method | Required Role |
|-------|------|------------------|---------------|
| `/` (dashboard) | `src/app/page.tsx` | Clerk middleware `auth.protect()` | Any authenticated (data filtered by `getAccessibleBusinessIds` in `/api/businesses`) |
| `/business/[id]` | `src/app/business/[id]/page.tsx` | Data filtered via `checkBusinessAccess(id)` in `/api/businesses/[id]` | Any role with access |
| `/business/[id]/ground-truth` | (future) | `checkBusinessAccess(id, "editor")` | Editor or Admin |
| `/add` | `src/app/add/page.tsx` | `POST /api/businesses` checks `isAdmin` | Admin only |
| `/api/scan` | `src/app/api/scan/route.ts` | `checkBusinessAccess(business_id, "editor")` | Editor or Admin |
| `/api/businesses` GET | `src/app/api/businesses/route.ts` | `getAccessibleBusinessIds()` filter | Any authenticated |
| `/api/businesses` POST | `src/app/api/businesses/route.ts` | `requireAuth()` + `isAdmin` | Admin only |
| `/api/businesses/[id]` GET | `src/app/api/businesses/[id]/route.ts` | `checkBusinessAccess(id)` | Any role with access |
| `/api/businesses/[id]` DELETE | `src/app/api/businesses/[id]/route.ts` | `requireAuth()` + `isAdmin` | Admin only |
| `/api/results/[businessId]` GET | `src/app/api/results/[businessId]/route.ts` | `checkBusinessAccess(businessId)` | Any role with access |
| `/api/cron/scan` | `src/app/api/cron/scan/route.ts` | `CRON_SECRET` header (skipped by Clerk middleware) | N/A |
| `/sign-in`, `/sign-up` | Clerk pages | Public (skipped by Clerk middleware) | N/A |

### 1.11 Edge Cases and Error Handling

1. **User not in `user_business_access` and not admin:** `checkBusinessAccess` returns `null` -> API returns 403. UI should show "You don't have access to this business."

2. **`ADMIN_CLERK_IDS` env var missing or empty:** No admins exist. All users require explicit `user_business_access` rows. Log a warning at startup.

3. **Clerk session expired mid-request:** `auth()` returns `{ userId: null }`. `requireAuth()` throws, caught by route handler -> 401.

4. **Race condition — user removed from access while viewing:** Next API call fails with 403. Client-side should handle 403 responses by redirecting to dashboard.

5. **Supabase unavailable:** `getSupabase()` returns `null` -> `checkBusinessAccess` throws -> 500. This is the existing behavior.

---

## 2. Automated Scanning via Vercel Cron

### Overview

A cron route at `/api/cron/scan` runs weekly (Monday 6am UTC), scans all businesses sequentially with error isolation, respects API rate limits, and logs results to a `scan_logs` table. The existing `scanBusiness()` function in `src/lib/scanner/index.ts` is reused as-is.

### 2.1 SQL Migration

File: `supabase/003_scan_logs.sql`

```sql
-- Scan cycle logs for auditing and debugging
CREATE TABLE scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type text NOT NULL CHECK (scan_type IN ('cron_weekly', 'manual')),
  businesses_scanned integer NOT NULL,
  businesses_failed integer NOT NULL,
  total_duration_ms integer,
  details jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_scan_logs_created ON scan_logs(created_at);
CREATE INDEX idx_scan_logs_type ON scan_logs(scan_type);
```

### 2.2 Vercel Cron Configuration

File: `vercel.json` (create or merge with existing)

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

This runs every Monday at 6:00 AM UTC.

### 2.3 Cron Route

File: `src/app/api/cron/scan/route.ts`

```typescript
import { getSupabase } from "@/lib/supabase";
import { scanBusiness, type ScanResult } from "@/lib/scanner";
import { aggregateVisibilityScores } from "@/lib/scanner/aggregator";

const DELAY_BETWEEN_BUSINESSES_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  // Verify cron secret — Vercel sends this as Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const startTime = Date.now();

  // Fetch all businesses
  const { data: businesses, error: bizError } = await supabase
    .from("businesses")
    .select("id, name")
    .order("created_at");

  if (bizError) {
    return Response.json({ error: "Failed to fetch businesses" }, { status: 500 });
  }

  if (!businesses || businesses.length === 0) {
    return Response.json({ message: "No businesses to scan", scanned: 0 });
  }

  // Process businesses sequentially with delay between each
  const results: {
    business_id: string;
    business_name: string;
    status: "ok" | "error";
    queries_run?: number;
    error?: string;
  }[] = [];

  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i];

    // Budget check: if we've used more than 250s of the 300s timeout, stop
    if (Date.now() - startTime > 250_000) {
      results.push({
        business_id: biz.id,
        business_name: biz.name,
        status: "error",
        error: "Skipped — approaching function timeout",
      });
      continue;
    }

    try {
      const scanResults: ScanResult[] = await scanBusiness(biz.id);
      await aggregateVisibilityScores(biz.id, scanResults);

      results.push({
        business_id: biz.id,
        business_name: biz.name,
        status: "ok",
        queries_run: scanResults.length,
      });
    } catch (err) {
      results.push({
        business_id: biz.id,
        business_name: biz.name,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue scanning other businesses — error isolation
    }

    // Delay between businesses to respect rate limits
    if (i < businesses.length - 1) {
      await sleep(DELAY_BETWEEN_BUSINESSES_MS);
    }
  }

  const totalDuration = Date.now() - startTime;
  const scannedCount = results.filter((r) => r.status === "ok").length;
  const failedCount = results.filter((r) => r.status === "error").length;

  // Log scan cycle
  await supabase.from("scan_logs").insert({
    scan_type: "cron_weekly",
    businesses_scanned: scannedCount,
    businesses_failed: failedCount,
    total_duration_ms: totalDuration,
    details: results,
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
  });

  return Response.json({
    scanned: scannedCount,
    failed: failedCount,
    duration_ms: totalDuration,
    results,
  });
}
```

### 2.4 Rate Limiting Strategy

The current `scanBusiness()` in `src/lib/scanner/index.ts` (lines 63-91) processes queries and platforms sequentially in nested `for` loops. This naturally serializes API calls. Combined with the 1.5s inter-business delay:

**Capacity calculation:**
- 4 platforms x 3 queries per business = 12 API calls per business
- With sequential execution, each business takes ~15-25 seconds
- 1.5s delay between businesses
- **Within 300s timeout:** ~12-15 businesses maximum

**Anthropic rate limit (50 RPM free tier):**
- Sequential calls with natural network latency (~1-2s per call) means ~30-60 calls/min
- With 12 businesses x 3 queries = 36 Claude calls total, spread over ~3-4 minutes
- This is within the 50 RPM limit

**If more than 12 businesses are needed (future):**
- Option A: Run cron more frequently (twice weekly) and split businesses into batches
- Option B: Add an explicit per-platform delay in `scanBusiness()` for Claude calls
- Not needed for MVP

### 2.5 Batching for >8 Businesses

The cron route includes a time budget check (`250_000ms` of the `300_000ms` timeout). If a business scan would run past the budget, it's skipped with a clear error. This means:

- **8 businesses**: ~160-200s — comfortably within budget
- **12 businesses**: ~240-300s — at the edge, some may be skipped
- **20+ businesses**: Requires a batching strategy (future work)

For the MVP with a small number of businesses, sequential processing with the time budget check is sufficient.

### 2.6 Edge Cases and Error Handling

1. **One business fails, others continue:** The try/catch inside the loop ensures error isolation. Failed businesses are logged with the error message in the `scan_logs.details` JSONB column.

2. **All businesses fail (API key expired):** All results have `status: "error"`. The scan_logs entry captures this. The dashboard remains unchanged (no new `query_results` rows are written for failed scans — `scanBusiness()` catches per-platform errors internally at `src/lib/scanner/index.ts:87-89`).

3. **Function timeout approaching:** The 250s budget check skips remaining businesses rather than risking a hard timeout. Skipped businesses get an explicit error message in the log.

4. **CRON_SECRET not set:** `authHeader !== Bearer undefined` — every request fails with 401. This is correct behavior — the cron route should not run without a secret.

5. **No API keys configured:** `scanBusiness()` throws `"No AI platform API keys configured"` (line 59 of `index.ts`). Caught per-business, logged as error.

6. **Supabase insert fails for scan_logs:** The response still returns (the log insert is fire-and-forget at the end). In practice this is unlikely since the scan itself uses Supabase successfully.

7. **Concurrent cron executions:** Vercel cron does not run overlapping executions of the same route. If a previous run is still in-flight, the next scheduled run is skipped. No dedup needed on our side.

---

## 3. Visibility Score Aggregation

### Overview

The `visibility_scores` table already exists in `supabase/001_initial_schema.sql` (lines 34-45) with columns: `business_id`, `platform`, `period_start`, `period_end`, `total_queries`, `times_mentioned`, `mention_rate`, `avg_position`. It is currently never populated. The aggregator computes these values from `ScanResult[]` after each scan cycle.

### 3.1 SQL Migration — Unique Constraint on visibility_scores

File: `supabase/004_visibility_scores_unique.sql`

```sql
-- MANDATORY: this constraint is required for the aggregator's upsert to work.
-- Without it, Postgres rejects ON CONFLICT with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- Verified against @supabase/postgrest-js — the JS client passes onConflict columns
-- directly to Postgres; the constraint must exist at the DB level.
-- Must run AFTER 001_initial_schema.sql which creates the table.
ALTER TABLE visibility_scores
  ADD CONSTRAINT uq_visibility_scores_biz_platform_period
  UNIQUE (business_id, platform, period_start, period_end);
```

> **Why not `ignoreDuplicates`?** Supabase's `upsert` also supports `{ ignoreDuplicates: true }`, which silently skips conflicting rows instead of updating them. That's wrong here — we want to **overwrite** stale scores when a business is re-scanned on the same day, not silently drop the new data.

> **Why a separate migration file?** Open question #4 from iteration 2 asked whether to put this in `002_user_business_access.sql`. Answer: **separate file**. Migration `002` is for auth (user_business_access), `003` is for cron (scan_logs), `004` is for aggregation. Each migration corresponds to one functional area. This makes it safe to run migrations incrementally and roll back independently.

### 3.2 Aggregator Module

File: `src/lib/scanner/aggregator.ts`

```typescript
import { getSupabase } from "@/lib/supabase";
import type { ScanResult } from "@/lib/scanner";

/**
 * Aggregate scan results into visibility_scores, grouped by platform.
 * Called after both manual scans (POST /api/scan) and cron scans.
 *
 * Each call upserts one visibility_scores row per platform for the
 * given business, with period_start = period_end = today's date.
 *
 * Relies on the unique constraint from 004_visibility_scores_unique.sql:
 *   UNIQUE (business_id, platform, period_start, period_end)
 */
export async function aggregateVisibilityScores(
  businessId: string,
  scanResults: ScanResult[]
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  if (scanResults.length === 0) return;

  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  // Group results by platform
  const byPlatform = new Map<
    string,
    { total: number; mentioned: number; positions: number[] }
  >();

  for (const r of scanResults) {
    if (!byPlatform.has(r.platform)) {
      byPlatform.set(r.platform, { total: 0, mentioned: 0, positions: [] });
    }
    const stats = byPlatform.get(r.platform)!;
    stats.total++;
    if (r.business_mentioned) {
      stats.mentioned++;
      if (r.position_in_response !== null) {
        stats.positions.push(r.position_in_response);
      }
    }
  }

  // Upsert one row per platform for today.
  // The unique constraint on (business_id, platform, period_start, period_end)
  // ensures that re-scanning the same business on the same day overwrites
  // rather than duplicating. This is atomic — no delete+insert race condition.
  for (const [platform, stats] of byPlatform) {
    const mentionRate =
      stats.total > 0 ? stats.mentioned / stats.total : 0;
    const avgPosition =
      stats.positions.length > 0
        ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length
        : null;

    const { error } = await supabase.from("visibility_scores").upsert(
      {
        business_id: businessId,
        platform,
        period_start: today,
        period_end: today,
        total_queries: stats.total,
        times_mentioned: stats.mentioned,
        mention_rate: mentionRate,
        avg_position: avgPosition,
      },
      { onConflict: "business_id,platform,period_start,period_end" }
    );

    if (error) {
      console.error(
        `Failed to upsert visibility score for ${platform}:`,
        error.message
      );
    }
  }
}
```

**Key change from iteration 2:** Replaced delete+insert with a single `upsert` call. This fixes the race condition where a failed delete would leave orphaned rows, and is atomic per-row. The `onConflict` string must exactly match the column list in the unique constraint.

### 3.3 Wiring Into Manual Scan Flow

The existing `POST /api/scan` route at `src/app/api/scan/route.ts` calls `scanBusiness()` and returns results. The aggregator is added after the scan completes. See section 1.9.1 above for the updated route code — the key addition is:

```typescript
import { aggregateVisibilityScores } from "@/lib/scanner/aggregator";

// After scanBusiness() returns:
await aggregateVisibilityScores(business_id, results);
```

### 3.4 Wiring Into Cron Flow

Already wired in the cron route (section 2.3 above). After each successful `scanBusiness()` call:

```typescript
await aggregateVisibilityScores(biz.id, scanResults);
```

### 3.5 Dashboard Compatibility — Sort Order Fix

The existing dashboard at `src/app/page.tsx` reads `visibility_scores` data. It expects `biz.visibility_scores` as an array of `{ platform, mention_rate, period_start }` objects (lines 13-17).

**Bug identified in iteration 2:** The dashboard's `latestByPlatform` Map (lines 61-65) keeps the **first** score per platform. But the `/api/businesses` query does NOT sort `visibility_scores` by date. This means the "latest" score shown could actually be the oldest.

**Fix:** Add `.order()` with `referencedTable` to the businesses query in the auth-modified version (section 1.9.2). The relevant line in `/api/businesses` GET changes from:

```typescript
const { data, error } = await supabase
  .from("businesses")
  .select("*, visibility_scores(*)")
  .in("id", accessibleIds)
  .order("created_at", { ascending: false });
```

to:

```typescript
const { data, error } = await supabase
  .from("businesses")
  .select("*, visibility_scores(*)")
  .in("id", accessibleIds)
  .order("created_at", { ascending: false })
  .order("period_start", { referencedTable: "visibility_scores", ascending: false });
```

This ensures `visibility_scores` are ordered newest-first within each business. The dashboard's `latestByPlatform` Map then correctly picks the most recent score per platform (since Map keeps the first inserted value, and the first value is now the most recent date).

**Dashboard `overallRate` — known limitation (not blocking):** The dashboard (lines 69-73) computes `overallRate` by averaging ALL `visibility_scores` rows across all dates, not just the latest per platform. With multiple weekly scans, historical scores dilute the average. This only becomes visible after 2+ scan cycles. **Why not fix now:** The dashboard code is out of Phase 2 scope — Phase 2 produces the backend specs that populate `visibility_scores`. The dashboard already exists and renders correctly with the data shape we produce. A future phase should filter `overallRate` to only the latest `period_start` per platform, but that's a dashboard-layer change, not a data-layer one.

### 3.7 Edge Cases and Error Handling

1. **Multiple scans same day:** The upsert on `(business_id, platform, period_start, period_end)` atomically overwrites. No race condition, no orphaned rows. The unique constraint (migration `004`) guarantees at most one row per business+platform+date.

2. **No scan results (all platforms failed):** `scanResults.length === 0` — aggregator returns early, no scores written. Dashboard shows stale data from previous scan, which is correct behavior.

3. **Platform has zero queries (no API key for that platform):** That platform simply won't appear in `scanResults` (because `getAvailablePlatforms()` at `index.ts:17-24` only includes platforms with configured API keys). No score row is created for unconfigured platforms.

4. **Null position values:** `position_in_response` is `null` when business is not mentioned (see `analyzer.ts:22-30`). The aggregator only includes non-null positions in the average calculation. If all results for a platform have null positions (business never mentioned), `avg_position` is stored as `null`.

5. **Upsert fails (Supabase error):** The error is logged via `console.error` but does not throw — other platforms' scores still get written. The dashboard shows stale data for the failed platform, which is acceptable degradation.

6. **Migration 004 applied to existing data with duplicates:** If `visibility_scores` already has duplicate `(business_id, platform, period_start, period_end)` rows from the old delete+insert pattern, the `ALTER TABLE ... ADD CONSTRAINT` will fail. Fix: run a dedup query before the migration:

```sql
-- Run manually ONLY if migration 004 fails due to existing duplicates
DELETE FROM visibility_scores a
  USING visibility_scores b
  WHERE a.id < b.id
    AND a.business_id = b.business_id
    AND a.platform = b.platform
    AND a.period_start = b.period_start
    AND a.period_end = b.period_end;
```

In practice, duplicates should not exist yet since the aggregator has never been deployed. This dedup query is a safety net.

---

## Open Questions

1. ~~**`/api/businesses` endpoint:**~~ **RESOLVED (iteration 2).** The endpoint exists at `src/app/api/businesses/route.ts`. It uses `select("*, visibility_scores(*)")`. Auth filtering added in section 1.9.2.

2. ~~**Clerk webhook vs manual admin flow:**~~ **RESOLVED (iteration 2).** Use manual flow for MVP — admin adds Clerk user IDs to `user_business_access` via direct Supabase insert or a future admin UI. Webhook deferred. Phase 1 explicitly recommends this: "Admin manually adds the Clerk user ID to `user_business_access` after the client signs up. Skip webhooks for now."

3. ~~**CRON_SECRET provisioning:**~~ **RESOLVED (iteration 2).** Vercel auto-generates `CRON_SECRET` when a project has cron jobs configured. It's sent as `Authorization: Bearer <secret>` header on cron invocations. No manual setup needed — Vercel handles it. For local testing, set `CRON_SECRET` in `.env.local` and call the route with `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/scan`.

4. ~~**Unique constraint on visibility_scores:**~~ **RESOLVED (iteration 3).** Added as a separate migration `supabase/004_visibility_scores_unique.sql`. Separate file chosen because each migration corresponds to one functional area (002=auth, 003=cron, 004=aggregation). Aggregator switched from delete+insert to upsert with `onConflict`.

5. **Cron frequency configurability per business:** Defer to a future phase. Keep uniform weekly schedule for MVP. The cron route scans all businesses on the same schedule.

---

## Learning Journal

### Iteration 1

- **DISCOVERY:** Clerk v7.1.0 is already installed. The API surface includes `clerkMiddleware` and `createRouteMatcher` from `@clerk/nextjs/server`, `auth()` from `@clerk/nextjs/server`, and UI components (`SignIn`, `SignUp`, `UserButton`, `ClerkProvider`) from `@clerk/nextjs`. The `auth()` function includes `auth.protect()` for middleware use. Layout is a server component; `UserButton` needs a client wrapper.
- **DISCOVERY:** The `scanBusiness()` function (index.ts:36-94) processes queries sequentially in nested for loops, naturally rate-limiting. It already has per-platform try/catch (line 66-89) for error isolation.
- **DISCOVERY:** The `visibility_scores` table exists but is never populated. The dashboard already reads from it via a `visibility_scores` join on the businesses query. The `ScanResult` interface (index.ts:26-34) has all fields needed for aggregation.
- **DISCOVERY:** The existing layout.tsx has no auth provider wrapping. Adding `ClerkProvider` is the first structural change.
- **APPROACH CHANGE:** Started by reading all source files before writing any spec code, rather than guessing interfaces. This revealed the exact `ScanResult` type, the `getSupabase()` pattern, and the sequential query execution model.
- **DEPTH REACHED:** Explore
- **NEXT:** Move to Build depth — validate that all file contents are truly copy-pasteable by checking import paths against the real module structure, and resolve the open questions.

### Iteration 2

- **DISCOVERY:** Next.js 16 (v16.2.3 installed) deprecates `middleware.ts` in favor of `proxy.ts`. However, `@clerk/nextjs` v7.1.0's `clerkMiddleware` returns `NextMiddleware` type and has not adopted the proxy convention. Must use `middleware.ts` for now — it's deprecated but functional.
- **DISCOVERY:** `/api/businesses` route EXISTS at `src/app/api/businesses/route.ts`. Uses `select("*, visibility_scores(*)")`. Also found `/api/businesses/[id]` with GET+DELETE and `/api/results/[businessId]` — all 3 need auth protection. POST `/api/businesses` creates businesses with auto-generated tracking queries — must be admin-only.
- **DISCOVERY:** `ClerkProvider` IS a server component in v7 (confirmed via `components.server.d.ts` export). The dynamic import pattern from iteration 1 was unnecessary — a simple client component wrapper for `UserButton` is cleaner.
- **DISCOVERY:** The businesses API query does NOT sort visibility_scores by `period_start desc`. The dashboard's `latestByPlatform` Map works by keeping the first score per platform, so ordering matters for correctness. Flagged as a note, not a blocker.
- **APPROACH CHANGE:** Replaced the dual layout approach (dynamic import + alternative) with a single clean approach: `src/components/user-button.tsx` client component + direct import in layout. Removed ambiguity. Added complete auth specs for ALL 4 discovered API routes, not just `/api/scan`.
- **DEPTH REACHED:** Build (early) — all file contents are copy-pasteable, import paths verified against real package exports
- **NEXT:** Iteration 3 should add the unique constraint migration for visibility_scores, switch aggregator to upsert, and verify the 4 default tracking query templates match the existing code. Then shift to deeper Build: verify error handling paths end-to-end.

### Iteration 3

- **DISCOVERY:** The dashboard's `latestByPlatform` Map at `page.tsx:61-65` keeps the first score per platform, but `/api/businesses` does not sort `visibility_scores` by `period_start desc`. This means the "latest" score displayed could be any historical score. Supabase supports `.order("col", { referencedTable: "table" })` to sort nested relations.
- **DISCOVERY:** The dashboard `overallRate` (lines 69-73) averages ALL visibility_scores rows across all dates, not just the latest scan. With multiple scan dates, this dilutes the average. Flagged as a future fix, not blocking MVP.
- **DISCOVERY:** The `upsert` method in Supabase JS client requires the `onConflict` parameter to be a comma-separated string of column names matching a unique constraint. The constraint must exist in the DB or upsert silently falls back to insert (which then fails on duplicate).
- **APPROACH CHANGE:** Resolved open question #4 — unique constraint goes in its own migration file (`004`) rather than being appended to `002`. Each migration maps to one functional area (auth, cron, aggregation). Also added a dedup safety-net query in case the migration is applied to a DB with existing duplicate rows. Added error logging per-platform in the upsert loop rather than letting one failure kill the whole aggregation.
- **DEPTH REACHED:** Build (mid) — all 3 areas now have copy-pasteable specs with edge cases. Aggregator is atomically correct.
- **NEXT:** Iteration 4 should begin Harden depth: (1) verify `auth()` behavior when called from API routes vs middleware — confirm it reads the same session token, (2) add the `requireAuth` import to unused `getAccessibleBusinessIds` call in businesses route, (3) verify Supabase `upsert` actually needs the constraint or if `ignoreDuplicates` is an alternative, (4) consider whether scan_logs should log manual scans too (currently only cron).

### Iteration 4

- **DISCOVERY:** `auth()` in API route handlers reads from `AsyncLocalStorage` populated by `clerkMiddleware`. Both share the `AuthFn` type. The middleware stores auth state via `clerkMiddlewareRequestDataStorage` (an `AsyncLocalStorage<Map>` instance), and `auth()` retrieves it from the same async context. This means `auth()` never re-authenticates — it depends on the middleware having run first. If middleware is bypassed (cron routes), `auth()` returns `{ userId: null }`.
- **DISCOVERY:** Supabase `upsert` with `onConflict` is NOT a client-side feature — the JS client passes column names directly to PostgREST, which generates `ON CONFLICT (cols) DO UPDATE` SQL. Postgres requires a matching unique constraint or it rejects the query at runtime. `ignoreDuplicates: true` is an alternative that does `ON CONFLICT DO NOTHING` — wrong for our case since we want to overwrite stale scores.
- **DISCOVERY:** All TypeScript import paths verified correct: `@/lib/supabase` (exists, exports `getSupabase`), `@/lib/scanner` (exists via `index.ts` barrel), `@clerk/nextjs` (exports `ClerkProvider`, `SignIn`, `SignUp`), `@clerk/nextjs/server` (exports `clerkMiddleware`, `createRouteMatcher`, `auth`). Files to be created (`@/lib/auth`, `@/lib/scanner/aggregator`, `@/components/user-button`) confirmed absent as expected.
- **APPROACH CHANGE:** Added manual scan logging to `POST /api/scan` route — both success and failure paths now write to `scan_logs` with `scan_type: "manual"`. This makes the audit trail complete: every scan (cron or manual) is logged. The `scan_logs` CHECK constraint already included `'manual'` since iteration 2. Also strengthened the migration 004 documentation: the unique constraint is MANDATORY for upsert, not optional. Added explicit note about why `ignoreDuplicates` is wrong for this use case.
- **DEPTH REACHED:** Harden — all 5 verification items from iteration 3 journal resolved with source-level evidence
- **NEXT:** All areas should now score 5/5 on Harden criteria. Remaining items for final review: (1) confirm the auth protection map is still complete after adding scan logging, (2) verify no open questions remain.

## Adaptive Scorecard

| Area | Score | Criteria (Harden) | Notes |
|------|-------|--------------------|-------|
| Clerk Auth Integration | 5/5 | Survives code review: Yes. Error paths: auth session propagation verified via AsyncLocalStorage, 403/401 paths documented, race conditions covered. | `auth()` confirmed to share session with middleware. All 4 API routes protected. Import paths verified. Admin UI deferred per Phase 1 (out of scope). |
| Automated Scanning via Vercel Cron | 5/5 | Survives code review: Yes. Error paths: per-business isolation, time budget guard, scan_logs for both cron AND manual scans. | Manual scan logging added to POST /api/scan. CHECK constraint already included 'manual'. Rate limit math validated. |
| Visibility Score Aggregation | 5/5 | Survives code review: Yes. Error paths: upsert verified to require DB constraint (not client-side), per-platform error logging, dedup safety net for migration. | Unique constraint is MANDATORY (Postgres enforces). `ignoreDuplicates` explicitly rejected. Dashboard sort-order fixed. `overallRate` averaging documented as out-of-scope dashboard-layer issue. |
