import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const interSans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CurbOps · BTP Command Centre",
  description: "Operational command centre for Bengaluru Traffic Police parking enforcement, CBM scoring, hotspot prioritization, and patrol deployment support.",
  keywords: ["CurbOps", "BTP", "Bengaluru Traffic Police", "traffic analytics", "live operations", "command centre"],
  authors: [{ name: "CurbOps" }],
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${interSans.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
