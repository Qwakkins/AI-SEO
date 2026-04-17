import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-[#0a0a0a] text-gray-100">
          <header className="bg-[#111111] border-b border-gray-800">
            <nav className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
              <Link href="/" className="text-xl font-bold text-white">
                GEO Tracker
              </Link>
              <div className="flex items-center gap-4">
                <Link
                  href="/add"
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
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
