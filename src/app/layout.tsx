import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const loraSerif = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Register of Trade Unions — Papua New Guinea",
    template: "%s — Register of Trade Unions",
  },
  description:
    "The official public registry of trade unions registered under the Industrial Organizations Act. Published by the Office of The Industrial Registrar, PNG Department of Labour & Industrial Relations.",
  keywords: [
    "trade unions",
    "union registry",
    "industrial organizations act",
    "industrial registrar",
    "papua new guinea",
    "labour relations",
    "union registration",
  ],
  authors: [{ name: "Office of The Industrial Registrar" }],
  creator: "Office of The Industrial Registrar",
  publisher: "Office of The Industrial Registrar",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Register of Trade Unions — Papua New Guinea",
    description:
      "The official public registry of trade unions registered under the Industrial Organizations Act. Published by the Office of The Industrial Registrar.",
    siteName: "Register of Trade Unions",
    type: "website",
    locale: "en_PG",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Register of Trade Unions — Office of The Industrial Registrar, Papua New Guinea",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Register of Trade Unions — Papua New Guinea",
    description:
      "The official public registry of trade unions registered under the Industrial Organizations Act.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
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
        className={`${geistSans.variable} ${geistMono.variable} ${loraSerif.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
