import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/providers";
import { Toaster } from "@/components/ui/toaster";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const fontBrand = Unbounded({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: {
    default: "STELOS — AI Marketing OS",
    template: "%s | STELOS",
  },
  description:
    "AI-powered marketing operating system. Go from goal to strategy to distribution in minutes.",
  keywords: ["marketing automation", "AI marketing", "CRM", "campaign management"],
  authors: [{ name: "STELOS Team" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL,
    title: "STELOS — AI Marketing OS",
    description: "AI-powered marketing operating system.",
    siteName: "STELOS",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontMono.variable} ${fontBrand.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
