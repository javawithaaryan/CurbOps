import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const interSans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CausaFlow AI · BTP Command Centre",
  description: "Production-grade traffic-violation analytics dashboard for the Bengaluru Traffic Police. Built for Gridlock 2.0.",
  keywords: ["CausaFlow", "BTP", "Bengaluru Traffic Police", "traffic analytics", "Gridlock 2.0", "command centre"],
  authors: [{ name: "CausaFlow AI" }],
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
        <Toaster />
      </body>
    </html>
  );
}
