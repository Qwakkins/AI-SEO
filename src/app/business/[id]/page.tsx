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

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/businesses/${id}`).then((r) => r.json()),
      fetch(`/api/results/${id}`).then((r) => r.json()),
    ]).then(([bizData, resultsData]) => {
      setBusiness(bizData);
      setResults(resultsData.results || []);
      setSummary(resultsData.summary || []);
      if (resultsData.results?.length > 0) setScanComplete(true);
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
      <Link href="/" className="text-blue-600 text-sm hover:underline">
        &larr; Back to Dashboard
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold">{business.name}</h1>
        <p className="text-gray-500">
          {business.category} &middot; {business.location}
        </p>
        {business.website_url && (
          <a
            href={business.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 text-sm hover:underline"
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
              ? "bg-blue-400 text-white cursor-not-allowed"
              : scanComplete
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
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
          <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-sm font-medium text-gray-700">
                Querying AI platforms...
              </p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse w-full" />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Running {business.tracking_queries?.length || 4} queries across AI
              platforms. This usually takes 30-60 seconds.
            </p>
          </div>
        )}

        {/* Scan Error */}
        {scanError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 font-medium">Scan failed</p>
            <p className="text-sm text-red-600">{scanError}</p>
          </div>
        )}

        {/* Post-Scan Summary */}
        {lastScan && !scanning && (
          <div
            className={`mt-4 rounded-lg border p-4 ${
              lastScan.mentioned_count > 0
                ? lastScan.mentioned_count / lastScan.total_queries >= 0.5
                  ? "bg-green-50 border-green-200"
                  : "bg-amber-50 border-amber-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-800">Scan Complete</p>
              <span className="text-xs text-gray-400">
                {new Date().toLocaleString()}
              </span>
            </div>

            {/* Results Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">
                  Mentioned in{" "}
                  <span className="font-bold">
                    {lastScan.mentioned_count}/{lastScan.total_queries}
                  </span>{" "}
                  queries
                </span>
                <span className="font-bold">
                  {Math.round(
                    (lastScan.mentioned_count / lastScan.total_queries) * 100
                  )}
                  %
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    lastScan.mentioned_count > 0
                      ? lastScan.mentioned_count / lastScan.total_queries >= 0.5
                        ? "bg-green-500"
                        : "bg-amber-500"
                      : "bg-red-400"
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
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {platform}: {stats.mentioned}/{stats.total}
                  </span>
                ));
              })()}
            </div>

            {lastScan.mentioned_count === 0 && (
              <p className="text-sm text-gray-600 mt-3">
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
          <h2 className="text-lg font-semibold mb-3">AI Visibility Summary</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary.map((s) => {
              const rate = Math.round(s.mention_rate * 100);
              return (
                <div
                  key={s.platform}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <p className="text-sm text-gray-500 capitalize">
                    {s.platform}
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      rate > 50
                        ? "text-green-600"
                        : rate > 0
                          ? "text-amber-600"
                          : "text-red-500"
                    }`}
                  >
                    {rate}%
                  </p>
                  <p className="text-xs text-gray-400">
                    {s.mentioned}/{s.total} queries
                  </p>
                  {rate === 0 && (
                    <p className="text-xs text-red-400 mt-1">Not found</p>
                  )}
                </div>
              );
            })}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-600 font-medium">Overall</p>
              <p className="text-2xl font-bold text-blue-700">
                {Math.round(overallRate * 100)}%
              </p>
              <p className="text-xs text-blue-400">
                {overallMentioned}/{overallTotal} total
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tracking Queries */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Tracking Queries</h2>
        <div className="flex flex-wrap gap-2">
          {business.tracking_queries?.map((q) => (
            <span
              key={q.id}
              className={`text-sm px-3 py-1 rounded-full ${
                q.is_active
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {q.query_template}
            </span>
          ))}
        </div>
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Scan Results</h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Query</th>
                  <th className="text-left px-4 py-3 font-medium">Platform</th>
                  <th className="text-left px-4 py-3 font-medium">Mentioned</th>
                  <th className="text-left px-4 py-3 font-medium">
                    Competitors
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                      onClick={() =>
                        setExpandedResult(
                          expandedResult === r.id ? null : r.id
                        )
                      }
                    >
                      <td className="px-4 py-3">
                        {r.tracking_queries?.query_template}
                      </td>
                      <td className="px-4 py-3 capitalize">{r.platform}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block w-2 h-2 rounded-full mr-2 ${
                            r.business_mentioned
                              ? "bg-green-500"
                              : "bg-red-400"
                          }`}
                        />
                        {r.business_mentioned ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {r.competitors_mentioned?.length || 0} found
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(r.queried_at).toLocaleDateString()}
                      </td>
                    </tr>
                    {expandedResult === r.id && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-4 bg-gray-50 text-xs"
                        >
                          {r.mention_context && (
                            <div className="mb-3">
                              <p className="font-medium text-green-700 mb-1">
                                Mention context:
                              </p>
                              <p className="text-gray-700">
                                {r.mention_context}
                              </p>
                            </div>
                          )}
                          {r.competitors_mentioned?.length > 0 && (
                            <div className="mb-3">
                              <p className="font-medium mb-1">
                                Competitors mentioned:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {r.competitors_mentioned.map((c, i) => (
                                  <span
                                    key={i}
                                    className="bg-gray-200 px-2 py-0.5 rounded text-gray-700"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <details>
                            <summary className="cursor-pointer text-blue-600 hover:underline">
                              View full AI response
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap text-gray-600 max-h-64 overflow-y-auto">
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
        <p className="text-gray-400 text-center py-8">
          No scan results yet. Click &quot;Run Scan&quot; to check AI
          visibility.
        </p>
      )}
    </div>
  );
}
