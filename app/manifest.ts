import type { MetadataRoute } from "next";

/**
 * Web App Manifest。ホーム画面に追加したときの名称・アイコン・表示モードを定義する。
 * Next.js App Router が `/manifest.webmanifest` として配信する。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ONORE ANALYTICS",
    short_name: "ONORE",
    description:
      "ゲーム「己鯖」のちょっとしたデータが見られるツール。管理人が個人的に作ったものなので、データの正確性は保証されません。",
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1115",
    theme_color: "#0f1115",
    lang: "ja",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
