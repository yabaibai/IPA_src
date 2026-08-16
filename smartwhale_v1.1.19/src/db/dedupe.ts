// 請求去重：相同 key 的並發請求複用同一個 Promise，不重複發起網絡請求。
// 與「單飛放棄」不同：這裡是掛載到在飛的 Promise 上等同一結果，避免浪費且保證數據一致。

const inflight = new Map<string, Promise<any>>();

/**
 * 去重執行。若同名 key 已在飛，直接返回在飛的 Promise（複用結果）。
 * fn 執行完畢（無論成功/失敗）後自動從 inflight 移除，允許後續重新發起。
 */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    // 僅當仍是最初那個 Promise 時才刪除（防止並發替換錯誤清除）
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}
