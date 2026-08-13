import type { Metadata, Viewport } from "next";
import MotionProvider from "@/components/MotionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOTG Coffee",
  description: "Light of the Gospel Church Coffee Bar",
  // Lets a customer add the menu to their home screen and have it open
  // chromeless, like an app, rather than in a Safari tab.
  appleWebApp: {
    capable: true,
    title: "LOTG Coffee",
    statusBarStyle: "default",
  },
  formatDetection: {
    // Stops iOS turning order numbers and prices into blue phone links.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Content extends under the notch and home indicator; the safe-area
  // utilities in globals.css put the padding back where it matters.
  viewportFit: "cover",
  // Paints the Safari chrome to match the page in each appearance, so the
  // status bar doesn't sit in a white strip above a black page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
