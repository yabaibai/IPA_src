// ── 极简全局轻提示（无第三方依赖）──────────────────────────────────────────
// 通过模块级订阅，任意处调用 showToast(msg) 即在顶层渲染一行提示 2s。
type Listener = (msg: string) => void;
let listener: Listener | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function setToastListener(l: Listener | null) {
  listener = l;
}

export function showToast(msg: string, duration = 2000) {
  if (!listener) return;
  listener(msg);
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => listener?.(""), duration);
}
