import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chair Beatboxer — 16-bit Office Rhythm Game",
  description: "Trafiaj strzałki, kręć combo i przeżyj zmianę w najbardziej rytmicznym IT na świecie.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
