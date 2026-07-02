"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface VisibilityScore {
  platform: string;
  mention_rate: number;
  period_start: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt: "#10a37f",
  claude: "#d97706",
  gemini: "#4285f4",
  perplexity: "#22b8cf",
};

export default function TrendChart({ scores }: { scores: VisibilityScore[] }) {
  const byDate = new Map<string, Record<string, number | string>>();
  const platforms = new Set<string>();

  for (const s of scores) {
    platforms.add(s.platform);
    const row = byDate.get(s.period_start) ?? { date: s.period_start };
    row[s.platform] = Math.round(Number(s.mention_rate) * 100);
    byDate.set(s.period_start, row);
  }

  const data = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  if (data.length < 2) {
    return (
      <p className="text-sm text-gray-400 bg-white border border-gray-200 rounded-lg p-4">
        Not enough data yet — trends appear after your second scan.
      </p>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 12 }}
          />
          <Tooltip formatter={(value) => `${value}%`} />
          <Legend />
          {[...platforms].map((p) => (
            <Line
              key={p}
              type="monotone"
              dataKey={p}
              stroke={PLATFORM_COLORS[p] ?? "#8884d8"}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
