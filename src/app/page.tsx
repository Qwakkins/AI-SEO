"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Business {
  id: string;
  name: string;
  location: string;
  category: string;
  website_url: string | null;
  created_at: string;
  visibility_scores: {
    platform: string;
    mention_rate: number;
    period_start: string;
  }[];
}

export default function Dashboard() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/businesses")
      .then((res) => res.json())
      .then((data) => {
        setBusinesses(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-gray-500">Loading businesses...</p>;
  }

  if (businesses.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-semibold mb-2">No businesses tracked yet</h2>
        <p className="text-gray-500 mb-6">
          Add a business to start tracking its AI visibility.
        </p>
        <Link
          href="/add"
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Your First Business
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {businesses.map((biz) => {
          const scores = biz.visibility_scores || [];
          const latestByPlatform = new Map<string, number>();
          for (const s of scores) {
            if (!latestByPlatform.has(s.platform)) {
              latestByPlatform.set(s.platform, s.mention_rate);
            }
          }

          const platforms = ["chatgpt", "gemini", "claude", "perplexity"];
          const overallRate =
            scores.length > 0
              ? scores.reduce((sum, s) => sum + Number(s.mention_rate), 0) /
                scores.length
              : null;

          return (
            <Link
              key={biz.id}
              href={`/business/${biz.id}`}
              className="block bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-lg">{biz.name}</h3>
              <p className="text-sm text-gray-500 mb-3">
                {biz.category} &middot; {biz.location}
              </p>

              {overallRate !== null ? (
                <p className="text-2xl font-bold text-blue-600 mb-3">
                  {Math.round(overallRate * 100)}%
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    mention rate
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gray-400 mb-3">No scans yet</p>
              )}

              <div className="flex gap-2">
                {platforms.map((p) => {
                  const rate = latestByPlatform.get(p);
                  const color =
                    rate === undefined
                      ? "bg-gray-200"
                      : rate >= 0.5
                        ? "bg-green-400"
                        : rate >= 0.2
                          ? "bg-yellow-400"
                          : "bg-red-400";
                  return (
                    <span
                      key={p}
                      className={`${color} text-xs px-2 py-1 rounded font-medium capitalize`}
                      title={
                        rate !== undefined
                          ? `${p}: ${Math.round(rate * 100)}%`
                          : `${p}: no data`
                      }
                    >
                      {p}
                    </span>
                  );
                })}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
