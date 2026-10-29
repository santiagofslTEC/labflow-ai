import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { MotionProvider } from "@/components/app-shell/motion-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

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
};

// `cover` lets the fixed dock pad itself by env(safe-area-inset-bottom).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
