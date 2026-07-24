"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  resolveSidebarOpen,
  SIDEBAR_DESKTOP_MIN_WIDTH,
  SIDEBAR_DESKTOP_QUERY,
  SIDEBAR_STORAGE_KEY,
} from "@/lib/sidebarLayout";

export interface SidebarLayoutState {
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  isMobile: boolean;
  sidebarLayoutReady: boolean;
  toggleSidebar: () => void;
}

/**
 * サイドバーの開閉状態とモバイル判定を管理するフック。
 *
 * - デスクトップ（768px 以上）: 前回の開閉状態を localStorage から復元。既定は開く。
 * - モバイル（768px 未満）: オーバーレイのため常に閉じた状態で始める。
 * - デスクトップの開閉操作は localStorage へ保存し次回以降復元する。
 * - モバイルでサイドバーが開いている間は body のスクロールをロックする。
 */
export function useSidebarLayout(): SidebarLayoutState {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarLayoutReady, setSidebarLayoutReady] = useState(false);

  // 画面幅に応じてサイドバーの初期表示を切り替え
  useEffect(() => {
    const apply = (isDesktop: boolean) => {
      setIsMobile(!isDesktop);
      // デスクトップは保存した好みを復元。モバイルはオーバーレイのため常に閉じる。
      setSidebarOpen(
        resolveSidebarOpen(isDesktop, () =>
          window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
        )
      );
      setSidebarLayoutReady(true);
    };

    const applyViewportWidth = () =>
      apply(window.innerWidth >= SIDEBAR_DESKTOP_MIN_WIDTH);

    let mql: MediaQueryList;
    let isDesktop: boolean;
    try {
      mql = window.matchMedia(SIDEBAR_DESKTOP_QUERY);
      const matches = mql?.matches;
      if (typeof matches !== "boolean") {
        throw new Error("Invalid MediaQueryList");
      }
      isDesktop = matches;
    } catch {
      // matchMediaを使えない環境でもhead scriptと同じ境界で安全に初期化する。
      applyViewportWidth();
      try {
        window.addEventListener("resize", applyViewportWidth);
        return () => window.removeEventListener("resize", applyViewportWidth);
      } catch {
        return;
      }
    }

    apply(isDesktop);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    try {
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
      }
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    } catch {
      // 初期状態は確定済み。listener非対応でも表示と手動開閉は維持する。
      return;
    }
  }, []);

  // モバイルでサイドバー展開中は背景（body）のスクロールをロックする。
  useEffect(() => {
    if (!(isMobile && sidebarOpen)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, sidebarOpen]);

  const toggleSidebar = useCallback(() => {
    // hydration直後の幅判定前にMobile設定をDesktop用キーへ保存しない。
    if (!sidebarLayoutReady) return;

    setSidebarOpen((v) => {
      const next = !v;
      if (!isMobile) {
        try {
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
        } catch {
          /* localStorage 不可（プライベートモード等）でも開閉自体は動作させる */
        }
      }
      return next;
    });
  }, [isMobile, sidebarLayoutReady]);

  return {
    sidebarOpen,
    setSidebarOpen,
    isMobile,
    sidebarLayoutReady,
    toggleSidebar,
  };
}
