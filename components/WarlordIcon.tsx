"use client";

import { useState } from "react";

/**
 * ランキングから取り込んだ武将アイコン。外部サイトの画像を参照するため、
 * リファラは送らず、URL が無いか読み込めなければダミー画像を表示する。
 */
export function WarlordIcon({
  url,
  size,
  className,
}: {
  url?: string;
  size: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const classes = ["warlord-icon", className].filter(Boolean).join(" ");
  // アイコン未取り込み・読み込み失敗時は、人型のダミー画像を出す。
  if (!url || failed) {
    return (
      <svg
        className={classes + " warlord-icon-dummy"}
        width={size}
        height={size}
        viewBox="-4 -4 32 32"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="9" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
      </svg>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 外部ドメインの任意画像のため next/image は使わない
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={classes}
      onError={() => setFailed(true)}
    />
  );
}
