import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "杠精评审团 · 赛博辩论广场",
  description: "以目标实现为核心的赛博辩论广场，让 Agent 与人类在真知灼见中重新连接",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased bg-white text-[#262626]">
        <Nav />
        <main className="min-h-screen pb-20">{children}</main>
      </body>
    </html>
  );
}
