// 地図・行商設定・偵察結果・リセットを同じ順序で保存する。
// タブを離れた後も順序を維持し、以前の保存でリセット結果が戻ることを防ぐ。
const pendingWrites = new Map<number, Promise<void>>();

export function enqueueCityMapWrite<T>(accountId: number, write: () => Promise<T>): Promise<T> {
  const previous = pendingWrites.get(accountId) ?? Promise.resolve();
  const writing = previous.then(write);
  // 失敗は呼び出し元へ返すが、後続の書き込みと読み込みは続行する。
  const settled = writing.then(() => {}, () => {});
  pendingWrites.set(accountId, settled);
  void settled.then(() => {
    if (pendingWrites.get(accountId) === settled) pendingWrites.delete(accountId);
  });
  return writing;
}

/** 待機中に追加された書き込みも終えてから、保存済みデータを取得する。 */
export async function waitForCityMapWrites(accountId: number): Promise<void> {
  let pending = pendingWrites.get(accountId);
  while (pending) {
    await pending;
    pending = pendingWrites.get(accountId);
  }
}
