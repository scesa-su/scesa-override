import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, VT323 } from "next/font/google";
import "./globals.css";

const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
  fallback: ["Courier New", "monospace"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  fallback: ["Courier New", "monospace"],
});

export const metadata: Metadata = {
  title: "Sentinel Override",
  description: "SCESA Sentinel emergency override portal",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050805",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${vt323.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
