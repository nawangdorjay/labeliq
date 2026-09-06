import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/app/providers";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LabelIQ — PCR 2011 label compliance scanner (SIH26034)",
  description:
    "Scan packaged commodity labels, auto-detect languages, validate against the versioned Legal Metrology (Packaged Commodities) Rules 2011 rule engine, and produce evidence-backed compliance reports.",
  keywords: ["LabelIQ", "Legal Metrology", "PCR 2011", "SIH 2026", "label compliance", "OCR"],
  authors: [{ name: "LabelIQ Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${mono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          {/* sonner — every app component uses toast() from 'sonner'; without
              this mount, ALL feedback messages were silently invisible */}
          <SonnerToaster position="bottom-center" closeButton duration={4000} />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
