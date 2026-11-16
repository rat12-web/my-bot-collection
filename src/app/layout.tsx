import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "My BOT Collection | สมุดสะสม วิเคราะห์พอร์ต & เด็คการ์ด Battle of Talingchan",
  description:
    "เว็บแอปพลิเคชันจัดการคลังการ์ด Battle of Talingchan (BOT TCG) ครบวงจร นับ Playsets 4 ใบ & Surplus ไม่จำกัด เช็กราคา TCG Thailand และตรวจเด็คงานแข่งการ์ดบาป",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${notoSansThai.variable} ${jetbrainsMono.variable} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
