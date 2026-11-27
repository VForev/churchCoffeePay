import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

// No next/font here any more. The default type is the device's own system face (San
// Francisco on Apple devices) — see --app-heading in globals.css — so there is nothing
// to download. The church's Kumbh Sans & Nunito are one choice away at /admin/theme →
// Fonts, loaded only when picked.

export const metadata: Metadata = {
  title: "LOTG Coffee",
  description: "Light of the Gospel Church Coffee Bar",
  appleWebApp: { capable: true, title: "LOTG Coffee", statusBarStyle: "default" },
};

// Its own export since Next 14 — inside `metadata` it is ignored with a build warning,
// which quietly dropped `viewport-fit=cover` and with it the iPhone safe-area insets the
// bottom bars rely on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-body">
        {/* First thing in the body so every page's own <style> still wins over it —
            /admin/theme previews unsaved colours that way. */}
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}
