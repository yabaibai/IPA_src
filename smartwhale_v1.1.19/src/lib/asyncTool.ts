// 给任意 Promise 加超时，避免请求永久挂起导致页面一直 loading
// 8 秒未返回则 reject(TimeoutError)，触发调用方 catch → 复位 loading + 显示重试
export function withTimeout<T>(p: Promise<T>, ms = 8000, label = "request"): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
    ),
  ]);
}
