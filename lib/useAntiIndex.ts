"use client";

import { useEffect, useState } from "react";
import { fetchUnitTypes } from "./api";
import { buildAntiIndex } from "./stats";

/** 兵種一覧の取得前に使う空の索引（毎回同じ参照にして再描画を抑える）。 */
const EMPTY_INDEX: Map<string, Set<string>> = new Map();

/**
 * 兵種一覧を取得してアンチ索引（兵種名 → 得意兵種の集合）を返すフック。
 * 取得は fetchUnitTypes のキャッシュを使うため、複数箇所で呼んでも 1 リクエストに集約される。
 * 取得前・取得失敗時は空の索引を返す（＝アンチ矢印は出ない）。
 */
export function useAntiIndex(): Map<string, Set<string>> {
  const [index, setIndex] = useState<Map<string, Set<string>>>(EMPTY_INDEX);
  useEffect(() => {
    let alive = true;
    fetchUnitTypes()
      .then((list) => {
        if (alive) setIndex(buildAntiIndex(list));
      })
      .catch(() => {
        /* 取得失敗時は空の索引のまま（矢印なし）。 */
      });
    return () => {
      alive = false;
    };
  }, []);
  return index;
}
