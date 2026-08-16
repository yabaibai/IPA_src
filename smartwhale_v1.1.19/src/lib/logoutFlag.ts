// ── 全局登出中标记（FRD 3.5 / 4.1）──────────────────────────────────────────
// 独立零依赖模块，供 ctx / requestGuard / requestQueue / Tab hook 共享，
// 避免与 ctx 形成循环依赖。
// isLoggingOut=true 期间，所有网络回调、cacheSet、setState 都应跳过，防止异步污染状态。

let loggingOut = false;

export function setLoggingOut(v: boolean): void {
  loggingOut = v;
}

export function isLoggingOut(): boolean {
  return loggingOut;
}
