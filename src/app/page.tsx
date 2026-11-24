import Link from "next/link";

const steps = [
  {
    title: "Ask the assistants",
    body: "Each tracked business has search prompts like “best family dentist in San Diego”. A scan sends every prompt to ChatGPT, Claude, Gemini and Perplexity.",
  },
  {
    title: "Find the business",
    body: "Each answer is parsed for whether the business is named, where it appears in the answer, and which competitors are listed alongside it.",
  },
  {
    title: "Check the facts",
    body: "Phone numbers, street addresses, websites and services are pulled out of every answer and compared against the owner’s verified details.",
  },
  {
    title: "Track the trend",
    body: "Results roll up into a per-platform mention rate each day, and a weekly cron job rescans every business so the trend line keeps moving.",
  },
];

const exampleRates = [
  { platform: "ChatGPT", rate: 62 },
  { platform: "Claude", rate: 48 },
  { platform: "Gemini", rate: 31 },
  { platform: "Perplexity", rate: 12 },
];

const exampleFlags = [
  {
    field: "Phone",
    claim: "(619) 555-0148",
    truth: "(619) 555-0184",
    type: "Incorrect",
  },
  {
    field: "Address",
    claim: "412 Market St",
    truth: "1412 Market Street",
    type: "Incorrect",
  },
  {
    field: "Services",
    claim: "Invisalign",
    truth: "not offered",
    type: "Unverifiable",
  },
];

function rateColor(rate: number) {
  if (rate >= 50) return "bg-green-500";
  if (rate >= 20) return "bg-yellow-500";
  return "bg-red-500";
}

export default function Landing() {
  return (
    <div className="space-y-20 pb-12">
      <section className="pt-8 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-blue-400">
          Generative engine optimization
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">
          Know what AI assistants say
          <br className="hidden sm:block" /> about your business.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
          Customers increasingly ask an AI assistant for a recommendation
          instead of searching. GEO Tracker measures how often a local business
          gets recommended across the major assistants, and flags the phone
          numbers, addresses and services they get wrong.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-600"
          >
            Explore the live dashboard
          </Link>
          <a
            href="https://github.com/Qwakkins/AI-SEO"
            className="rounded-lg border border-gray-700 px-6 py-3 font-medium text-gray-200 transition-colors hover:border-gray-500"
          >
            View the code
          </a>
        </div>
      </section>

      <section aria-labelledby="example">
        <h2 id="example" className="sr-only">
          Example report
        </h2>
        <div className="rounded-xl border border-gray-800 bg-[#111111] p-6 sm:p-8">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500">
                Example report
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                Harbor Family Dental
              </p>
              <p className="text-sm text-gray-400">Dentist · San Diego, CA</p>
            </div>
            <p className="text-3xl font-bold text-blue-400">
              38%
              <span className="ml-1 text-sm font-normal text-gray-500">
                mention rate
              </span>
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-medium text-gray-300">
                Mention rate by platform
              </p>
              <ul className="space-y-3">
                {exampleRates.map((r) => (
                  <li key={r.platform}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-gray-300">{r.platform}</span>
                      <span className="text-gray-400">{r.rate}%</span>
                    </div>
                    <div className="h-2 rounded bg-gray-800">
                      <div
                        className={`h-2 rounded ${rateColor(r.rate)}`}
                        style={{ width: `${r.rate}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-gray-300">
                Hallucination flags
              </p>
              <ul className="divide-y divide-gray-800 text-sm">
                {exampleFlags.map((f) => (
                  <li
                    key={f.field + f.claim}
                    className="flex items-start justify-between gap-4 py-2"
                  >
                    <div>
                      <p className="text-gray-200">
                        {f.field}:{" "}
                        <span className="text-red-300">{f.claim}</span>
                      </p>
                      <p className="text-gray-500">Verified: {f.truth}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        f.type === "Incorrect"
                          ? "bg-red-900 text-red-300"
                          : "bg-yellow-900 text-yellow-300"
                      }`}
                    >
                      {f.type}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-xs text-gray-600">
            Illustrative data. The business and numbers above are made up.
          </p>
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="mb-8 text-2xl font-bold text-white">
          How a scan works
        </h2>
        <ol className="grid gap-6 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-gray-800 p-5">
              <p className="text-sm font-medium text-blue-400">Step {i + 1}</p>
              <p className="mt-1 font-semibold text-white">{s.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="stack"
        className="border-t border-gray-800 pt-10"
      >
        <h2 id="stack" className="mb-4 text-lg font-semibold text-white">
          Built with
        </h2>
        <p className="text-sm leading-relaxed text-gray-400">
          Next.js 16 (App Router) and React 19 · TypeScript · Supabase Postgres
          · OpenAI, Anthropic, Gemini and Perplexity APIs · Recharts · Tailwind
          CSS 4 · Vercel with a weekly cron scan.
        </p>
      </section>
    </div>
  );
}
