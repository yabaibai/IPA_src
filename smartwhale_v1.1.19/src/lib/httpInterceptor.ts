// ── HTTP 拦截器：401 会话过期全局兜底（FRD 4.4）────────────────────────────
// 统一捕获接口 401 状态码：排除登录中、登出中状态；命中 401 自动调用完整登出流程，
// 跳转登录页，避免页面停留在 App 内持续报错。
//
// 覆盖两条请求通道：
//   1) supabase-js 的底层 fetch（所有 .from()/.rpc()/auth 请求）→ 通过 global.fetch 包装注入；
//   2) callFunction 的自定义 fetch（Edge Function 调用）→ 通过 guardedCallFunction 包装。
//
// 「登录中」排除：通过当前是否在登录页路径判断（避免登录接口自身 401 触发登出死循环）。

import { supabase } from "@/client/supabase";
import { handleSessionExpired, isLoggingOut } from "@/lib/requestGuard";

// ── 登录中判定 ──────────────────────────────────────────────────────────────
// 轻量判断：当前路由处于登录/注册分组则视为「登录中」，401 不触发登出。
// 用 location.pathname 兼容 Web；Native 下 expo-router 不暴露全局 location，
// 由调用方在登录页主动 setLoginInProgress(true) 兜底（见下方 registerLoginActivity）。
let loginInProgress = false;

export function setLoginActivity(active: boolean): void {
  loginInProgress = active;
}

function isLoginFlow(): boolean {
  if (loginInProgress) return true;
  try {
    if (typeof window !== "undefined" && window.location) {
      const p = window.location.pathname || "";
      if (p.includes("/sign-in") || p.includes("/(auth)") || p === "/") return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

// ── 401 处理入口（去抖：避免同一次失效并发触发多次登出）──────────────────────
let last401At = 0;
function onUnauthorized(): void {
  if (isLoggingOut()) return;       // 登出中不再处理
  if (isLoginFlow()) return;        // 登录中（含登录页/登录接口）不踢
  const now = Date.now();
  if (now - last401At < 1000) return; // 1s 内去抖
  last401At = now;
  handleSessionExpired();
}

/** 检测错误是否为认证失效（401 / JWT 过期 / session 缺失） */
export function isAuthError(e: any): boolean {
  if (!e) return false;
  if (e.status === 401) return true;
  const msg: string = e.message || "";
  if (/jwt|401|unauthorized|auth session missing|invalid authentication/i.test(msg)) return true;
  if ((e as any).__isAuthError) return true;
  return false;
}

/** 在捕获到错误时，若是认证失效则触发登出兜底，返回 true 表示已处理 */
export function maybeHandleAuthError(e: any): boolean {
  if (isAuthError(e)) {
    onUnauthorized();
    return true;
  }
  return false;
}

// ── 包装 supabase 底层 fetch（覆盖所有 supabase 请求）────────────────────────
let installed = false;
export function installHttpInterceptor(): void {
  if (installed) return;
  installed = true;

  const origFetch = (supabase as any).rest?.fetch;
  if (typeof origFetch !== "function") return; // 防御：结构不符则跳过

  const wrapped = async (input: any, init?: any) => {
    let res: Response;
    try {
      res = await origFetch(input, init);
    } catch (e) {
      // 网络层异常（含 supabase 抛出的 AuthSessionMissingError 等）也检查
      if (isAuthError(e)) onUnauthorized();
      throw e;
    }
    if (res && typeof res.status === "number" && res.status === 401) {
      onUnauthorized();
    }
    return res;
  };
  try {
    (supabase as any).rest.fetch = wrapped;
  } catch {
    /* ignore：无法注入时降级为手动 maybeHandleAuthError 调用 */
  }
}

/**
 * 带 401 拦截的 Edge Function 调用（替代直接使用 callFunction 的关键业务入口）。
 * 命中 401 → 触发登出兜底；其余透传 callFunction 行为。
 */
export async function guardedCallFunction<T = unknown>(
  functionName: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { callFunction } = await import("@/client/supabase");
  try {
    return await callFunction<T>(functionName, body);
  } catch (e) {
    maybeHandleAuthError(e);
    throw e;
  }
}
