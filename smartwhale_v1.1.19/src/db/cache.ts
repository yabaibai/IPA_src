// ── 双层缓存 ──────────────────────────────────────────────────────────────
// 1) 内存缓存 mem：TTL 30s（CACHE_TTL）。优先读取，保障 Tab 切换丝滑，App 内存回收会丢失。
// 2) 持久缓存 persist：AsyncStorage 长 TTL（PERSIST_TTL）。当内存丢失时回退旧数据，后台静默刷新。
//    （FRD 4.5：持久层兜底，避免内存回收后空白）
//
// 写入策略（FRD 3.2/3.3 约束）：只允许「整套 Tab 数据」批量写入，禁止单接口逐次写入。
//   本模块只暴露 cacheSet（整批），调用方必须拼好整套对象一次性写入。

import AsyncStorage from "@react-native-async-storage/async-storage";

const mem = new Map<string, { v: any; ts: number }>();

export const CACHE_TTL = 30_000;          // 内存缓存 30s
export const PERSIST_TTL = 10 * 60_000;   // 持久缓存 10min（长 TTL 兜底）

const PERSIST_PREFIX = "tabcache:";

// ── 内存层 ────────────────────────────────────────────────────────────────
export function cacheGet(key: string): any | null {
  const c = mem.get(key);
  if (!c) return null;
  if (Date.now() - c.ts > CACHE_TTL) {
    mem.delete(key);
    return null;
  }
  return c.v;
}

export function cacheSet(key: string, v: any): void {
  mem.set(key, { v, ts: Date.now() });
  // 同步镜像到持久层（异步、fire-and-forget，失败忽略，不影响主流程）
  persistSet(key, v).catch(() => {});
}

// 静默刷新内存 TTL（下拉刷新/后台校验时调用，避免刚写入又被 TTL 判过期）
export function cacheTouch(key: string): void {
  const c = mem.get(key);
  if (c) c.ts = Date.now();
}

// ── 持久层（AsyncStorage）──────────────────────────────────────────────────
async function persistGet(key: string): Promise<{ v: any; ts: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: any; ts: number };
    if (Date.now() - parsed.ts > PERSIST_TTL) return null; // 持久层也过期则不回退
    return parsed;
  } catch {
    return null;
  }
}

async function persistSet(key: string, v: any): Promise<void> {
  try {
    const payload = JSON.stringify({ v, ts: Date.now() });
    await AsyncStorage.setItem(PERSIST_PREFIX + key, payload);
  } catch {
    /* 持久层写入失败忽略（磁盘满/序列化异常），内存层仍有效 */
  }
}

async function persistClear(userId: string): Promise<void> {
  try {
    const suffix = ":" + userId;
    const keys = await AsyncStorage.getAllKeys();
    const target = keys.filter(
      (k) => k.startsWith(PERSIST_PREFIX) && k.slice(PERSIST_PREFIX.length).endsWith(suffix)
    );
    if (target.length) await AsyncStorage.multiRemove(target);
  } catch {
    /* ignore */
  }
}

/**
 * 读缓存（双层）：
 *  - 内存命中（30s TTL）→ 直接返回；
 *  - 内存 miss → 回退持久层（长 TTL），同时回填内存，供 UI 秒渲染；
 *  - 两层都 miss/expired → 返回 null。
 * 注意：持久层命中时不会触发网络刷新，刷新由 Tab loadData 流程决定（FRD 3.3）。
 */
export async function cacheGetLayered(key: string): Promise<{ v: any; from: "mem" | "persist" } | null> {
  const memHit = cacheGet(key);
  if (memHit != null) return { v: memHit, from: "mem" };

  const p = await persistGet(key);
  if (p) {
    // 回填内存，保障后续同步读取命中
    mem.set(key, { v: p.v, ts: Date.now() });
    return { v: p.v, from: "persist" };
  }
  return null;
}

/** 退出登录时清掉该用户的所有缓存（内存 + 持久层，key 含 ":userId"） */
export function cacheClear(userId: string): void {
  if (!userId) return;
  const suffix = ":" + userId;
  for (const k of Array.from(mem.keys())) {
    if (k.endsWith(suffix)) mem.delete(k);
  }
  persistClear(userId).catch(() => {});
}
