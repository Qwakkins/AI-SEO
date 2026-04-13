"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AddBusiness() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name"),
      location: form.get("location"),
      category: form.get("category"),
      website_url: (() => {
        const url = (form.get("website_url") as string)?.trim();
        if (!url) return null;
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        return `https://${url}`;
      })(),
    };

    const res = await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      setSubmitting(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Add a Business</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Business Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Joe's Donuts"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium mb-1">
            Location
          </label>
          <input
            id="location"
            name="location"
            type="text"
            required
            placeholder="San Diego, CA"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium mb-1">
            Category
          </label>
          <input
            id="category"
            name="category"
            type="text"
            required
            placeholder="donut shop"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            How someone would search for this type of business
          </p>
        </div>

        <div>
          <label
            htmlFor="website_url"
            className="block text-sm font-medium mb-1"
          >
            Website URL (optional)
          </label>
          <input
            id="website_url"
            name="website_url"
            type="text"
            placeholder="joesdonuts.com"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add Business"}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          Default tracking queries will be auto-generated based on the category
          and location.
        </p>
      </form>
    </div>
  );
}
