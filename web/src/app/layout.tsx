import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { MotionProvider } from "@/components/app-shell/motion-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";
import { THEME_COLORS } from "./manifest";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LabFlow AI",
  description: "Cuaderno de laboratorio por voz",
  // Add to Home Screen on iOS opens it standalone with its own icon (spec 0010, AC-10).
  appleWebApp: { capable: true, title: "LabFlow", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// `cover` lets the fixed dock and the tab bar pad themselves by the safe areas.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [...THEME_COLORS],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body>
        <MotionProvider>
          {children}
          <Toaster />
        </MotionProvider>
      </body>
    </html>
  );
}
