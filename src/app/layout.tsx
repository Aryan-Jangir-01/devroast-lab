import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "DevRoast Lab — Flagsmith Live A/B Experimentation Arena",
  description:
    "Test Something Real: Brutal Checklist vs Guided Coach head-to-head experiment for developer Resumes & GitHub READMEs powered by Flagsmith Experimentation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-[#09090b] text-zinc-50 font-sans selection:bg-[#f5c518]/25 selection:text-[#fde047]">
        {children}
      </body>
    </html>
  );
}
