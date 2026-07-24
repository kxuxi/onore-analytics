/** shell CSS と共有するDesktopサイドバーの境界。 */
export const SIDEBAR_DESKTOP_MIN_WIDTH = 768;
export const SIDEBAR_DESKTOP_QUERY =
  `(min-width: ${SIDEBAR_DESKTOP_MIN_WIDTH}px)` as const;

/** デスクトップでのサイドバー開閉設定を保存する localStorage キー。 */
export const SIDEBAR_STORAGE_KEY = "onore.sidebarOpen";

/**
 * 初期サイドバーを開くか判定する。
 *
 * - Mobileでは保存値を参照せず、常に閉じる。
 * - Desktopでは未保存または "1" なら開き、その他の値なら閉じる。
 * - Desktopで保存値を読めない場合は、既定どおり開く。
 */
export function resolveSidebarOpen(
  isDesktop: boolean,
  readPreference: () => string | null
): boolean {
  if (!isDesktop) return false;

  try {
    const preference = readPreference();
    return preference === null || preference === "1";
  } catch {
    return true;
  }
}

/**
 * Reactのハイドレーション前に、初期サイドバー幅をCSSで予約するためのスクリプト。
 * React管理下の要素やARIA属性は変更せず、htmlのdata属性だけを設定する。
 */
export const SIDEBAR_INIT_SCRIPT = `(function(){var f=function(){return typeof window.innerWidth==="number"&&window.innerWidth>=${SIDEBAR_DESKTOP_MIN_WIDTH}};var d=false;try{if(typeof window.matchMedia==="function"){var m=window.matchMedia(${JSON.stringify(
  SIDEBAR_DESKTOP_QUERY
)});var x=m&&m.matches;d=typeof x==="boolean"?x:f()}else{d=f()}}catch(e){d=f()}var o=false;if(d){try{var v=window.localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY
)});o=v===null||v==="1"}catch(e){o=true}}document.documentElement.dataset.sidebarInitial=o?"open":"closed"})();`;
