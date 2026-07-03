/**
 * hallucination-detector.ts
 *
 * Matching engine and pipeline orchestrator for hallucination detection.
 * Compares facts extracted from AI responses against verified business ground
 * truth, then persists flag records to the database.
 */

import { getSupabase } from "@/lib/supabase";
import { extractFacts, type ExtractedFacts } from "./fact-extractor";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GroundTruthRecord {
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  website_url: string | null;
  services: string[];
}

interface MatchResult {
  field: string;
  ai_claim: string;
  ground_truth_value: string | null;
  flag_type: "incorrect" | "unverifiable" | "not_mentioned";
  confidence: number;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Strip leading country code "1" from 11-digit US numbers
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  st: "street",
  ave: "avenue",
  blvd: "boulevard",
  dr: "drive",
  rd: "road",
  ln: "lane",
  ct: "court",
  pl: "place",
};

function normalizeAddress(addr: string): string {
  let s = addr.toLowerCase().replace(/,/g, " ");
  for (const [abbr, full] of Object.entries(ADDRESS_ABBREVIATIONS)) {
    // (?=\s|$) handles abbreviations at end of string
    s = s.replace(new RegExp(`\\b${abbr}\\.?(?=\\s|$)`, "g"), full);
  }
  return s.replace(/\s+/g, " ").trim();
}

function normalizeDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Levenshtein distance
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// ---------------------------------------------------------------------------
// matchFacts — public export
// ---------------------------------------------------------------------------

export function matchFacts(
  facts: ExtractedFacts,
  gt: GroundTruthRecord
): MatchResult[] {
  const flags: MatchResult[] = [];

  // ── Phone ──────────────────────────────────────────────────────────────────
  const aiPhone = facts.phones[0] ?? null; // use first extracted phone
  if (aiPhone !== null) {
    if (gt.phone) {
      const normAI = normalizePhone(aiPhone);
      const normGT = normalizePhone(gt.phone);
      if (normAI !== normGT) {
        flags.push({
          field: "phone",
          ai_claim: aiPhone,
          ground_truth_value: gt.phone,
          flag_type: "incorrect",
          confidence: 1.0,
        });
      }
      // else: match — no flag
    } else {
      flags.push({
        field: "phone",
        ai_claim: aiPhone,
        ground_truth_value: null,
        flag_type: "unverifiable",
        confidence: 1.0,
      });
    }
  } else if (gt.phone) {
    flags.push({
      field: "phone",
      ai_claim: "",
      ground_truth_value: gt.phone,
      flag_type: "not_mentioned",
      confidence: 1.0,
    });
  }

  // ── Address ────────────────────────────────────────────────────────────────
  // Compare extracted addresses against street only — AI responses typically
  // mention just the street address, not the full city/state/zip.
  const aiAddress = facts.addresses[0] ?? null;
  const gtAddressFull = [
    gt.address_street,
    gt.address_city,
    gt.address_state,
    gt.address_zip,
  ]
    .filter(Boolean)
    .join(", ");
  const hasGTAddress = gtAddressFull.length > 0;

  if (aiAddress !== null) {
    if (gt.address_street) {
      const normAI = normalizeAddress(aiAddress);
      const normGT = normalizeAddress(gt.address_street);
      const dist = levenshtein(normAI, normGT);
      if (dist > 3) {
        flags.push({
          field: "address",
          ai_claim: aiAddress,
          ground_truth_value: gtAddressFull,
          flag_type: "incorrect",
          confidence: 0.8,
        });
      }
      // else: close enough — no flag
    } else if (hasGTAddress) {
      // GT has city/state/zip but no street — can't meaningfully compare
      flags.push({
        field: "address",
        ai_claim: aiAddress,
        ground_truth_value: null,
        flag_type: "unverifiable",
        confidence: 1.0,
      });
    } else {
      flags.push({
        field: "address",
        ai_claim: aiAddress,
        ground_truth_value: null,
        flag_type: "unverifiable",
        confidence: 1.0,
      });
    }
  } else if (hasGTAddress) {
    flags.push({
      field: "address",
      ai_claim: "",
      ground_truth_value: gtAddressFull,
      flag_type: "not_mentioned",
      confidence: 1.0,
    });
  }

  // ── Website ────────────────────────────────────────────────────────────────
  const aiWebsite = facts.websites[0] ?? null;
  if (aiWebsite !== null) {
    if (gt.website_url) {
      const normAI = normalizeDomain(aiWebsite);
      const normGT = normalizeDomain(gt.website_url);
      if (normAI !== normGT) {
        flags.push({
          field: "website",
          ai_claim: aiWebsite,
          ground_truth_value: gt.website_url,
          flag_type: "incorrect",
          confidence: 1.0,
        });
      }
      // else: match — no flag
    } else {
      flags.push({
        field: "website",
        ai_claim: aiWebsite,
        ground_truth_value: null,
        flag_type: "unverifiable",
        confidence: 1.0,
      });
    }
  } else if (gt.website_url) {
    flags.push({
      field: "website",
      ai_claim: "",
      ground_truth_value: gt.website_url,
      flag_type: "not_mentioned",
      confidence: 1.0,
    });
  }

  // ── Services ───────────────────────────────────────────────────────────────
  const aiServices = facts.services;
  const gtServices = gt.services ?? [];

  // Track which GT services were mentioned by any AI claim
  const gtMentioned = new Set<number>();

  for (const aiSvc of aiServices) {
    const aiLower = aiSvc.toLowerCase();
    const matchedIndex = gtServices.findIndex((gtSvc) => {
      const gtLower = gtSvc.toLowerCase();
      return aiLower.includes(gtLower) || gtLower.includes(aiLower);
    });

    if (matchedIndex !== -1) {
      gtMentioned.add(matchedIndex);
      // match — no flag
    } else {
      flags.push({
        field: "services",
        ai_claim: aiSvc,
        ground_truth_value: gtServices.join(", "),
        flag_type: "unverifiable",
        confidence: 0.7,
      });
    }
  }

  // GT services not mentioned by AI
  for (let i = 0; i < gtServices.length; i++) {
    if (!gtMentioned.has(i)) {
      flags.push({
        field: "services",
        ai_claim: "",
        ground_truth_value: gtServices[i],
        flag_type: "not_mentioned",
        confidence: 1.0,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// detectHallucinations — pipeline orchestrator
// ---------------------------------------------------------------------------

export async function detectHallucinations(businessId: string): Promise<void> {
  // 1. Get Supabase client, bail if not configured
  const supabase = getSupabase();
  if (!supabase) return;

  // 2. Load ground truth for this business
  const { data: groundTruth } = await supabase
    .from("business_ground_truth")
    .select(
      "phone, address_street, address_city, address_state, address_zip, website_url, services"
    )
    .eq("business_id", businessId)
    .single();

  // 3. Nothing to check without ground truth
  if (!groundTruth) return;

  const gt: GroundTruthRecord = {
    phone: groundTruth.phone ?? null,
    address_street: groundTruth.address_street ?? null,
    address_city: groundTruth.address_city ?? null,
    address_state: groundTruth.address_state ?? null,
    address_zip: groundTruth.address_zip ?? null,
    website_url: groundTruth.website_url ?? null,
    services: Array.isArray(groundTruth.services) ? groundTruth.services : [],
  };

  // 4. Get today's query_results for this business where business_mentioned=true
  const today = new Date().toISOString().split("T")[0];
  const { data: queryResults } = await supabase
    .from("query_results")
    .select(
      "id, response_text, business_mentioned, tracking_queries!inner(business_id)"
    )
    .eq("tracking_queries.business_id", businessId)
    .gte("queried_at", `${today}T00:00:00.000Z`)
    .eq("business_mentioned", true);

  if (!queryResults?.length) return;

  // 5. Process each result
  for (const result of queryResults) {
    // a. Delete existing flags for this result to avoid duplicates
    await supabase
      .from("hallucination_flags")
      .delete()
      .eq("query_result_id", result.id);

    // b. Extract facts from the AI response
    const facts = extractFacts(result.response_text as string);

    // c. Compare against ground truth
    const flags = matchFacts(facts, gt);

    // d. Insert flags (skip if none)
    if (flags.length === 0) continue;

    await supabase.from("hallucination_flags").insert(
      flags.map((f) => ({
        business_id: businessId,
        query_result_id: result.id,
        field: f.field,
        ai_claim: f.ai_claim,
        ground_truth_value: f.ground_truth_value,
        flag_type: f.flag_type,
        confidence: f.confidence,
      }))
    );
  }
}
