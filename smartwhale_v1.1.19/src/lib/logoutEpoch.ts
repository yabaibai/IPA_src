// ── 全局登出作废戳记（logoutEpoch）────────────────────────────────────────────
// 独立模块（不依赖任何业务模块），避免循环引用。
// 用途：登出時 bump，所有在飛的 Tab 數據請求（safeSingle/safeList）拿到結果後
// 若發現 epoch 已變（isStaleEpoch），直接丟棄結果（不 setState、不觸發二次請求），
// 避免舊請求繼續佔用 QPS / 觸發後端 WAF 限速（快速登出→重登時舊請求堆積是 418 限速的根因）。

let logoutEpoch = 0;

/** 取當前 epoch 值 */
export function getLogoutEpoch(): number {
  return logoutEpoch;
}

/** 登出時遞增，使在飛請求的快照失效 */
export function bumpLogoutEpoch(): void {
  logoutEpoch++;
}

/** 請求發起時記錄快照 */
export function snapshotLogoutEpoch(): number {
  return logoutEpoch;
}

/** 判斷請求發起後是否發生過登出（用於丟棄過期請求結果） */
export function isStaleEpoch(snapshot: number): boolean {
  return snapshot !== logoutEpoch;
}
