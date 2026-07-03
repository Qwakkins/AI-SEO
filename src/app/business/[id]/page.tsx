"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Business {
  id: string;
  name: string;
  location: string;
  category: string;
  website_url: string | null;
  tracking_queries: { id: string; query_template: string; is_active: boolean }[];
}

interface QueryResult {
  id: string;
  platform: string;
  response_text: string;
  business_mentioned: boolean;
  mention_context: string | null;
  position_in_response: number | null;
  competitors_mentioned: string[];
  queried_at: string;
  tracking_queries: { query_template: string };
}

interface PlatformSummary {
  platform: string;
  total: number;
  mentioned: number;
  mention_rate: number;
}

interface ScanResponse {
  total_queries: number;
  mentioned_count: number;
  results: {
    platform: string;
    business_mentioned: boolean;
  }[];
  error?: string;
}

interface GroundTruth {
  id: string;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  website_url: string | null;
  services: string[];
  verified_at: string | null;
}

interface HallucinationFlag {
  id: string;
  field: string;
  ai_claim: string;
  ground_truth_value: string | null;
  flag_type: "incorrect" | "unverifiable" | "not_mentioned";
  confidence: number;
  created_at: string;
  query_results: {
    platform: string;
    queried_at: string;
    tracking_queries: { query_template: string };
  };
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

export default function BusinessDetail() {
  const { id } = useParams<{ id: string }>();
  const [business, setBusiness] = useState<Business | null>(null);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [summary, setSummary] = useState<PlatformSummary[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResponse | null>(null);
  const [scanError, setScanError] = useState("");
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [groundTruth, setGroundTruth] = useState<GroundTruth | null>(null);
  const [flags, setFlags] = useState<HallucinationFlag[]>([]);
  const [savingGT, setSavingGT] = useState(false);
  const [gtError, setGtError] = useState("");
  const [gtForm, setGtForm] = useState({
    phone: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    website_url: "",
    services: "",
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/businesses/${id}`).then((r) => r.json()),
      fetch(`/api/results/${id}`).then((r) => r.json()),
      fetch(`/api/ground-truth/${id}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/hallucinations/${id}`).then((r) => r.json()).catch(() => ({ flags: [] })),
    ]).then(([bizData, resultsData, gtData, flagsData]) => {
      setBusiness(bizData);
      setResults(resultsData.results || []);
      setSummary(resultsData.summary || []);
      if (resultsData.results?.length > 0) setScanComplete(true);
      if (gtData && gtData.id) {
        setGroundTruth(gtData);
        setGtForm({
          phone: gtData.phone || "",
          address_street: gtData.address_street || "",
          address_city: gtData.address_city || "",
          address_state: gtData.address_state || "",
          address_zip: gtData.address_zip || "",
          website_url: gtData.website_url || "",
          services: (gtData.services || []).join(", "),
        });
      }
      setFlags(flagsData.flags || []);
      setLoading(false);
    });
  }, [id]);

  async function runScan() {
    setScanning(true);
    setScanComplete(false);
    setLastScan(null);
    setScanError("");

    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: id }),
    });

    const data = await res.json();

    if (!res.ok) {
      setScanError(data.error || "Scan failed");
      setScanning(false);
      return;
    }

    setLastScan(data);
    setScanComplete(true);
    setScanning(false);

    // Refresh results
    const refreshed = await fetch(`/api/results/${id}`).then((r) => r.json());
    setResults(refreshed.results || []);
    setSummary(refreshed.summary || []);
    // Refresh hallucination flags
    const flagsRefresh = await fetch(`/api/hallucinations/${id}`).then((r) =>
      r.json()
    );
    setFlags(flagsRefresh.flags || []);
  }

  async function saveGroundTruth() {
    setSavingGT(true);
    setGtError("");
    const body = {
      phone: gtForm.phone || null,
      address_street: gtForm.address_street || null,
      address_city: gtForm.address_city || null,
      address_state: gtForm.address_state || null,
      address_zip: gtForm.address_zip || null,
      website_url: gtForm.website_url || null,
      services: gtForm.services
        ? gtForm.services.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    };

    const res = await fetch(`/api/ground-truth/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      setGroundTruth(data);
    } else {
      const data = await res.json().catch(() => ({}));
      setGtError(data.error || "Failed to save");
    }
    setSavingGT(false);
  }

  function timeAgo(dateStr: string): string {
    const seconds = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 1000
    );
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (!business) {
    return <p className="text-red-500">Business not found.</p>;
  }

  const overallMentioned = summary.reduce((s, p) => s + p.mentioned, 0);
  const overallTotal = summary.reduce((s, p) => s + p.total, 0);
  const overallRate = overallTotal > 0 ? overallMentioned / overallTotal : 0;

  return (
    <div>
      <Link href="/" className="text-blue-400 text-sm hover:underline">
        &larr; Back to Dashboard
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold text-white">{business.name}</h1>
        <p className="text-gray-400">
          {business.category} &middot; {business.location}
        </p>
        {business.website_url && (
          <a
            href={business.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 text-sm hover:underline"
          >
            {business.website_url}
          </a>
        )}
      </div>

      {/* Scan Button + Progress */}
      <div className="mb-6">
        <button
          onClick={runScan}
          disabled={scanning}
          className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${
            scanning
              ? "bg-blue-800 text-blue-300 cursor-not-allowed"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          {scanning
            ? "Scanning..."
            : scanComplete
              ? "Scan Again"
              : "Run Scan"}
        </button>

        {/* Progress Bar */}
        {scanning && (
          <div className="mt-4 bg-[#161616] border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full" />
              <p className="text-sm font-medium text-gray-300">
                Querying AI platforms...
              </p>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-500 h-2 rounded-full animate-pulse w-full" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Running {business.tracking_queries?.length || 4} queries across AI
              platforms. This usually takes 30-60 seconds.
            </p>
          </div>
        )}

        {/* Scan Error */}
        {scanError && (
          <div className="mt-4 bg-red-900/30 border border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-300 font-medium">Scan failed</p>
            <p className="text-sm text-red-400">{scanError}</p>
          </div>
        )}

        {/* Post-Scan Summary */}
        {lastScan && !scanning && (
          <div
            className={`mt-4 rounded-lg border p-4 ${
              lastScan.mentioned_count > 0
                ? lastScan.mentioned_count / lastScan.total_queries >= 0.5
                  ? "bg-green-900/30 border-green-800"
                  : "bg-amber-900/30 border-amber-800"
                : "bg-red-900/30 border-red-800"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-white">Scan Complete</p>
              <span className="text-xs text-gray-500">
                {new Date().toLocaleString()}
              </span>
            </div>

            {/* Results Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">
                  Mentioned in{" "}
                  <span className="font-bold text-white">
                    {lastScan.mentioned_count}/{lastScan.total_queries}
                  </span>{" "}
                  queries
                </span>
                <span className="font-bold text-white">
                  {Math.round(
                    (lastScan.mentioned_count / lastScan.total_queries) * 100
                  )}
                  %
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    lastScan.mentioned_count > 0
                      ? lastScan.mentioned_count / lastScan.total_queries >= 0.5
                        ? "bg-green-500"
                        : "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{
                    width: `${Math.max(
                      (lastScan.mentioned_count / lastScan.total_queries) * 100,
                      lastScan.mentioned_count > 0 ? 5 : 0
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Per-platform breakdown */}
            <div className="flex gap-3 flex-wrap">
              {(() => {
                const platforms: Record<
                  string,
                  { total: number; mentioned: number }
                > = {};
                for (const r of lastScan.results) {
                  if (!platforms[r.platform])
                    platforms[r.platform] = { total: 0, mentioned: 0 };
                  platforms[r.platform].total++;
                  if (r.business_mentioned)
                    platforms[r.platform].mentioned++;
                }
                return Object.entries(platforms).map(([platform, stats]) => (
                  <span
                    key={platform}
                    className={`text-xs px-3 py-1 rounded-full font-medium capitalize ${
                      stats.mentioned > 0
                        ? "bg-green-900/50 text-green-300"
                        : "bg-red-900/50 text-red-300"
                    }`}
                  >
                    {platform}: {stats.mentioned}/{stats.total}
                  </span>
                ));
              })()}
            </div>

            {lastScan.mentioned_count === 0 && (
              <p className="text-sm text-gray-400 mt-3">
                Your business was not found in any AI responses. This is your
                baseline — optimizing your schema, reviews, and content can
                improve this.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Platform Summary */}
      {summary.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">AI Visibility Summary</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary.map((s) => {
              const rate = Math.round(s.mention_rate * 100);
              return (
                <div
                  key={s.platform}
                  className="bg-[#161616] border border-gray-700 rounded-lg p-4"
                >
                  <p className="text-sm text-gray-400 capitalize">
                    {s.platform}
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      rate > 50
                        ? "text-green-400"
                        : rate > 0
                          ? "text-amber-400"
                          : "text-red-400"
                    }`}
                  >
                    {rate}%
                  </p>
                  <p className="text-xs text-gray-500">
                    {s.mentioned}/{s.total} queries
                  </p>
                  {rate === 0 && (
                    <p className="text-xs text-red-400 mt-1">Not found</p>
                  )}
                </div>
              );
            })}
            <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-400 font-medium">Overall</p>
              <p className="text-2xl font-bold text-blue-300">
                {Math.round(overallRate * 100)}%
              </p>
              <p className="text-xs text-blue-500">
                {overallMentioned}/{overallTotal} total
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fact Check */}
      {scanComplete && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">Fact Check</h2>
          {!groundTruth ? (
            <p className="text-sm text-gray-500">
              Add business facts below to enable hallucination detection
            </p>
          ) : flags.filter((f) => f.flag_type !== "not_mentioned").length ===
            0 ? (
            <div className="bg-green-900/30 border border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-300 font-medium">
                No hallucinations detected
              </p>
              <p className="text-xs text-green-400/70 mt-1">
                All AI-stated facts match your verified information
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-3">
                {flags.filter((f) => f.flag_type === "incorrect").length}{" "}
                incorrect{" "}
                {flags.filter((f) => f.flag_type === "incorrect").length === 1
                  ? "fact"
                  : "facts"}{" "}
                found across{" "}
                {
                  new Set(
                    flags
                      .filter((f) => f.flag_type !== "not_mentioned")
                      .map((f) => f.query_results?.platform)
                  ).size
                }{" "}
                {new Set(
                  flags
                    .filter((f) => f.flag_type !== "not_mentioned")
                    .map((f) => f.query_results?.platform)
                ).size === 1
                  ? "platform"
                  : "platforms"}
              </p>
              <div className="space-y-3">
                {flags
                  .filter((f) => f.flag_type !== "not_mentioned")
                  .map((flag) => (
                    <div
                      key={flag.id}
                      className={`rounded-lg border p-4 ${
                        flag.flag_type === "incorrect"
                          ? "border-red-800 bg-red-900/20"
                          : "border-yellow-800 bg-yellow-900/20"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white capitalize">
                          {flag.field}
                        </span>
                        <span className="text-xs text-gray-500">
                          <span className="capitalize">
                            {flag.query_results?.platform}
                          </span>
                          {flag.query_results?.tracking_queries
                            ?.query_template &&
                            ` \u00b7 ${flag.query_results.tracking_queries.query_template}`}
                        </span>
                      </div>
                      <div className="text-sm space-y-1">
                        <p className="text-red-400">
                          <span className="text-gray-500">AI said:</span>{" "}
                          {flag.ai_claim || "\u2014"}
                        </p>
                        {flag.ground_truth_value && (
                          <p className="text-green-400">
                            <span className="text-gray-500">Correct:</span>{" "}
                            {flag.ground_truth_value}
                          </p>
                        )}
                      </div>
                      {flag.flag_type === "unverifiable" && (
                        <p className="text-xs text-yellow-500/70 mt-2">
                          Could not verify — no ground truth for this field
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tracking Queries */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-white">Tracking Queries</h2>
        <div className="flex flex-wrap gap-2">
          {business.tracking_queries?.map((q) => (
            <span
              key={q.id}
              className={`text-sm px-3 py-1 rounded-full ${
                q.is_active
                  ? "bg-green-900/50 text-green-300"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {q.query_template}
            </span>
          ))}
        </div>
      </div>

      {/* Business Facts (Ground Truth) */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-1 text-white">
          Business Facts
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Enter verified information to detect AI hallucinations
        </p>
        <div className="bg-[#161616] border border-gray-700 rounded-lg p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Phone
            </label>
            <input
              type="text"
              value={gtForm.phone}
              onChange={(e) =>
                setGtForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="(619) 226-6333"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Address
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={gtForm.address_street}
                onChange={(e) =>
                  setGtForm((prev) => ({
                    ...prev,
                    address_street: e.target.value,
                  }))
                }
                placeholder="1815 Newton Ave"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                value={gtForm.address_city}
                onChange={(e) =>
                  setGtForm((prev) => ({
                    ...prev,
                    address_city: e.target.value,
                  }))
                }
                placeholder="San Diego"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={gtForm.address_state}
                onChange={(e) =>
                  setGtForm((prev) => ({
                    ...prev,
                    address_state: e.target.value,
                  }))
                }
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">State</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={gtForm.address_zip}
                onChange={(e) =>
                  setGtForm((prev) => ({
                    ...prev,
                    address_zip: e.target.value,
                  }))
                }
                placeholder="92113"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Website
            </label>
            <input
              type="text"
              value={gtForm.website_url}
              onChange={(e) =>
                setGtForm((prev) => ({
                  ...prev,
                  website_url: e.target.value,
                }))
              }
              placeholder="philsbbq.net"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Services
            </label>
            <input
              type="text"
              value={gtForm.services}
              onChange={(e) =>
                setGtForm((prev) => ({
                  ...prev,
                  services: e.target.value,
                }))
              }
              placeholder="BBQ, catering, dine-in"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Separate services with commas
            </p>
          </div>

          {gtError && (
            <p className="text-red-400 text-sm">{gtError}</p>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={saveGroundTruth}
              disabled={savingGT}
              className="bg-blue-500 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {savingGT ? "Saving..." : "Save Facts"}
            </button>
            {groundTruth?.verified_at && (
              <span className="text-xs text-gray-500">
                Last verified: {timeAgo(groundTruth.verified_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-white">Scan Results</h2>
          <div className="bg-[#161616] border border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-300">Query</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-300">Platform</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-300">Mentioned</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-300">
                    Competitors
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-300">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className="border-b border-gray-800 cursor-pointer hover:bg-[#1e1e1e]"
                      onClick={() =>
                        setExpandedResult(
                          expandedResult === r.id ? null : r.id
                        )
                      }
                    >
                      <td className="px-4 py-3 text-gray-200">
                        {r.tracking_queries?.query_template}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-300">{r.platform}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block w-2 h-2 rounded-full mr-2 ${
                            r.business_mentioned
                              ? "bg-green-500"
                              : "bg-red-500"
                          }`}
                        />
                        <span className={r.business_mentioned ? "text-green-400" : "text-red-400"}>
                          {r.business_mentioned ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {r.competitors_mentioned?.length || 0} found
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(r.queried_at).toLocaleDateString()}
                      </td>
                    </tr>
                    {expandedResult === r.id && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-4 bg-[#111111] text-xs"
                        >
                          {r.mention_context && (
                            <div className="mb-3">
                              <p className="font-medium text-green-400 mb-1">
                                Mention context:
                              </p>
                              <p className="text-gray-300">
                                {r.mention_context}
                              </p>
                            </div>
                          )}
                          {r.competitors_mentioned?.length > 0 && (
                            <div className="mb-3">
                              <p className="font-medium text-gray-300 mb-1">
                                Competitors mentioned:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {r.competitors_mentioned.map((c, i) => (
                                  <span
                                    key={i}
                                    className="bg-gray-800 px-2 py-0.5 rounded text-gray-300"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <details>
                            <summary className="cursor-pointer text-blue-400 hover:underline">
                              View full AI response
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap text-gray-400 max-h-64 overflow-y-auto">
                              {r.response_text}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.length === 0 && !scanning && !scanComplete && (
        <p className="text-gray-500 text-center py-8">
          No scan results yet. Click &quot;Run Scan&quot; to check AI
          visibility.
        </p>
      )}
    </div>
  );
}
