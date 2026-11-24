import { afterEach, describe, expect, it, vi } from "vitest";

// Any database call would mean a write got past the guard.
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => {
    throw new Error("database touched");
  },
}));

import { writesEnabled } from "../access";
import { POST as createBusiness } from "@/app/api/businesses/route";
import { DELETE as deleteBusiness } from "@/app/api/businesses/[id]/route";
import { POST as saveFacts } from "@/app/api/ground-truth/[businessId]/route";
import { POST as runScan } from "@/app/api/scan/route";

const json = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
  });

afterEach(() => vi.unstubAllEnvs());

describe("writesEnabled", () => {
  it("is off unless NEXT_PUBLIC_ALLOW_WRITES is exactly 'true'", () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_WRITES", "");
    expect(writesEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_ALLOW_WRITES", "1");
    expect(writesEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_ALLOW_WRITES", "true");
    expect(writesEnabled()).toBe(true);
  });
});

describe("write routes in read-only mode", () => {
  it("refuse with 403 before touching the database", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_WRITES", "");
    const params = Promise.resolve({ id: "b1", businessId: "b1" });
    const responses = await Promise.all([
      createBusiness(json({ name: "A", location: "B", category: "C" })),
      deleteBusiness(json({}), { params }),
      saveFacts(json({ phone: "1" }), { params }),
      runScan(json({ business_id: "b1" })),
    ]);
    for (const r of responses) expect(r.status).toBe(403);
  });
});
