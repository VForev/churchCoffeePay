import type { Metadata, Viewport } from "next";
import { Kumbh_Sans, Nunito, Roboto } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

const kumbhSans = Kumbh_Sans({
  variable: "--font-kumbh",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
    <html
      lang="en"
      className={`${kumbhSans.variable} ${nunito.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">
        {/* First thing in the body so every page's own <style> still wins over it —
            /admin/theme previews unsaved colours that way. */}
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}
