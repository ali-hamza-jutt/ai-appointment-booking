import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppProviders } from "@/providers/app-providers";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "BookWise AI",
    template: "%s | BookWise AI",
  },
  description: "Book appointments through a clear AI-assisted conversation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full`}
    >
      <body
        className="min-h-full bg-canvas font-sans text-ink"
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
