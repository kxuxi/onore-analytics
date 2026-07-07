import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const SITE_NAME = "ONORE ANALYTICS";
const SITE_DESCRIPTION =
  "ゲーム「己鯖」の戦闘履歴から武将のタイプ・兵科を登録し、偵察リストから即座に検索できるツール。";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "ja_JP",
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/twitter-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
  ],
  viewportFit: "cover",
};

/**
 * 初期描画前にテーマを <html data-theme> へ適用し、ちらつき（FOUC）を防ぐ。
 * 判定ロジックは lib/theme.ts（loadThemePref / resolveTheme）と同一に保つこと。
 *   キー: onore-tool:theme:v1 / 自動時は 6:00〜18:00 をライト、それ以外をダーク。
 *   system は OS の prefers-color-scheme に従う。
 */
const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("onore-tool:theme:v1");var r;if(p==="light"||p==="dark"){r=p}else if(p==="system"){r=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"}else{var h=new Date().getHours();r=(h>=6&&h<18)?"light":"dark"}document.documentElement.dataset.theme=r}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
