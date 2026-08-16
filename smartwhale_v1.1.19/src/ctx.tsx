import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/client/supabase';
import { withTimeout } from '@/lib/asyncTool';
import { cacheClear } from '@/db/cache';
import { setLoggingOut } from '@/lib/logoutFlag';
import { clearQueue } from '@/lib/requestQueue';
import { bumpLogoutEpoch, getLogoutEpoch, snapshotLogoutEpoch, isStaleEpoch } from '@/lib/logoutEpoch';
export { getLogoutEpoch, snapshotLogoutEpoch, isStaleEpoch };

// ── SSO 本機儲存 key ──────────────────────────────────────────────────────────
const SESSION_TOKEN_KEY = "sw_session_token";
const KICKED_OUT_KEY    = "sw_kicked_out";

/**
 * 跨平台儲存工具
 * Web：localStorage（SecureStore 在 Web 上會拋錯）
 * Native（iOS/Android）：expo-secure-store 同步 API
 */
function storageGet(key: string): string | null {
  if (process.env.EXPO_OS === "web") {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  try { return SecureStore.getItem(key); } catch { return null; }
}

function storageSet(key: string, value: string): void {
  if (process.env.EXPO_OS === "web") {
    try { localStorage.setItem(key, value); } catch {}
  } else {
    try { SecureStore.setItem(key, value); } catch {}
  }
}

function storageDel(key: string): void {
  if (process.env.EXPO_OS === "web") {
    try { localStorage.removeItem(key); } catch {}
  } else {
    SecureStore.deleteItemAsync(key).catch(() => {});
  }
}

/** 儲存本機 SSO session token（登入成功後由登入頁呼叫） */
export function saveLocalSessionToken(token: string): void {
  storageSet(SESSION_TOKEN_KEY, token);
}

/**
 * 登入成功後源頭修復：把 supabase client 當前 session 同步寫入 ctx（React state），
 * 避免「setSession 異步 → onAuthStateChange → ctx setSession 延遲」導致進 Tab 時 userId 尚為空、
 * 首屏用空 userId 發請求 → 所有依賴 userId 的 Tab（我的/錢包/首頁/推廣/鯨魚池）數據全空。
 * 由 sign-in 在 router.replace 前 await 呼叫，確保進 Tab 時 session 已就緒。
 */
export async function syncSessionFromClient(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (sessionSetter) sessionSetter(data.session ?? null);
  } catch { /* ignore */ }
}

/**
 * 写操作前獲取「當前已校驗」的 userId（源頭修復：避免用閉包陳舊/空 userId 發起寫請求，
 * 導致 supabase 對 profiles.where id="" 更新 0 行卻不報錯 → 用戶以為保存成功實則靜默失敗）。
 * 使用 auth.getUser() 強制校驗 token 有效性；失效返回 null，由調用方攔截提示重新登錄。
 */
export async function getValidUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch { return null; }
}

/** 讀取本機 SSO session token */
export function getLocalSessionToken(): string | null {
  return storageGet(SESSION_TOKEN_KEY);
}

/** 清除本機 SSO session token（登出或封禁時調用） */
export function clearLocalSessionToken(): void {
  storageDel(SESSION_TOKEN_KEY);
}

/**
 * 彻底清除 supabase-js 本地會話。
 * supabase client 的 storage 已配置為 AsyncStorage（RN 環境下 localStorage 不存在），
 * 必須直接清 AsyncStorage 中 sb- 開頭的 auth key，不能依賴 localStorage（RN 下為 undefined）。
 */
export async function clearSupabaseLocalSession(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const sbKeys = keys.filter((k) => k.startsWith('sb-') && k.includes('auth-token'));
    if (sbKeys.length) await AsyncStorage.multiRemove(sbKeys);
  } catch { /* ignore */ }
}

/** 設定被踢下線旗標（強制登出前寫入，登入頁讀取後顯示提示） */
function setKickedOutFlag(): void {
  storageSet(KICKED_OUT_KEY, "1");
}

/** 讀取並清除被踢下線旗標（one-shot，防止重複提示） */
export function consumeKickedOutFlag(): boolean {
  const val = storageGet(KICKED_OUT_KEY);
  if (val) { storageDel(KICKED_OUT_KEY); return true; }
  return false;
}

// 模塊級 session setter 引用（由 SessionProvider 賦值），供 forceLocalSignOut 直接清空 session
let sessionSetter: ((s: Session | null) => void) | null = null;
// 最近一次有效 session 的 userId（供 forceLocalSignOut 清緩存時按用戶範圍，避免跨號讀舊緩存）
let lastUserId: string | null = null;

/**
 * 強制本地登出：直接清空 ctx 的 session 狀態（不依賴 supabase.auth.signOut 網絡回調），
 * 確保路由守衛 guard={!!session} 立即切換到登入頁，根治「退出按鈕無效/完全沒反應」。
 * 網絡 signOut 仍由 signOutCleanly 異步執行（清 DB token + 通知後端）。
 */
export async function forceLocalSignOut(): Promise<void> {
  // FRD 3.5/4.1: 登出中標記，阻止異步回調污染狀態
  setLoggingOut(true);
  // 全局作废戳记 +1：所有在飛的 Tab 數據請求結果將被丟棄（避免舊請求佔用 QPS 觸發限速）
  bumpLogoutEpoch();
  // 清空請求隊列中排隊未執行的任務（避免退出後仍發出舊 Tab 請求）
  try { clearQueue(); } catch { /* ignore */ }
  // 退出前取當前用戶 id（用於清緩存；從最近一次有效 session 捕獲，避免依賴已廢棄的同步 session API）
  const uid = lastUserId;
  // 清 ctx 自身持久化 token
  clearLocalSessionToken();
  // 彻底清 supabase-js 本地会话（AsyncStorage 的 sb-* key）——必須 await，否則跳轉後舊 session 仍殘留
  // 導致重登時 supabase client 從 AsyncStorage 讀回髒 session → 攜髒 token 調用 → 被拒（與「殺 App 重開能登」一致：殺 App 重置了進程內狀態）
  try { await clearSupabaseLocalSession(); } catch { /* ignore */ }
  // 额外尝试清 supabase-js 内存 session（global 更徹底：同時清內存 + 通知後端使舊 session 失效）
  try { await supabase.auth.signOut({ scope: "global" }); } catch { /* ignore */ }
  try { await supabase.auth.setSession(null); } catch { /* ignore */ }
  // 清該用戶的頁面數據緩存（避免下次登入其他號讀到舊緩存）
  try { cacheClear(uid ?? ""); } catch { /* ignore */ }
  // 立即清空 ctx session，触发 _layout 守卫 guard={!!session} 切到登录页
  if (sessionSetter) sessionSetter(null);
  // 延遲重置標記：路由回登入頁後，防回調短暫污染
  setTimeout(() => { setLoggingOut(false); }, 1500);
}

/**
 * 主動登出（使用者點「退出登入」時調用）
 * 與 SSO 強制踢出的區別：
 *   - 主動登出 → 清 DB token（表示此帳號目前無設備在線）
 *   - SSO 踢出 → 不清 DB token（DB token 已被新設備覆蓋，不能清除）
 */
export async function signOutCleanly(): Promise<void> {
  // FRD 3.5/4.1: 登出中標記
  setLoggingOut(true);
  // 本地先清 token（不依賴網絡）
  clearLocalSessionToken();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      // 清除 DB token（主動下線，無需踢出其他人）
      await supabase.from("profiles")
        .update({ active_session_token: null })
        .eq("id", user.id);
    }
  } catch (e) {
    console.error("[signOutCleanly] 清除 DB token 失敗:", e);
  }
  // 清本機 token（再保險一次）
  clearLocalSessionToken();
  // 網絡 signOut 加超時，避免 RN 弱網卡住導致「退出沒反應」
  try {
    await withTimeout(supabase.auth.signOut(), 5000, "signOut");
  } catch (e) {
    console.warn("[signOutCleanly] auth.signOut 超時/失敗（本地已清，忽略網絡錯誤）:", e);
  }
  // 延遲重置標記，給異步回調留緩衝
  setTimeout(() => { setLoggingOut(false); }, 1500);
}

/**
 * 校驗本機 SSO token 是否已被其他設備取代（單設備互斥，杜絕一切誤踢）
 *
 * 設計原則（第三版修復：瘋狂點頁面空列表+被踢連鎖）：
 *   - 本函數「不主動 refreshSession」：刷新交由 Supabase 客戶端 autoRefreshToken 處理，
 *     避免在切頁面/輪詢/回前台時大量並發 refresh 導致 token 競態、反而把用戶踢出。
 *   - 本函數唯一職責：查 DB active_session_token，與本機 stored 比較。
 *       DB==自己(或為空) → 不踢（正常線上，即使本地 session 曾短暫失效也由 autoRefresh 恢復）
 *       DB==他人(非空)   → 帳號已在其他設備登入（真被取代）→ 踢出（正確互斥）
 *   - 本地 session 是否過期/有效：完全不在此函數判斷，交給客戶端自動刷新。
 *     只有「確鑿證明被其他設備取代」才踢，其餘一律不踢。
 */
async function validateSessionToken(userId: string): Promise<void> {
  const stored = getLocalSessionToken();
  if (!stored) return; // 舊版帳號或尚未登入，跳過

  // 只查 DB 當前活躍 token（不 refresh、不依賴本地 session 有效性）
  const { data, error } = await supabase
    .from("profiles")
    .select("active_session_token")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[SSO] 查詢 active_session_token 失敗，跳過本次校驗（不踢）");
    return; // 查詢失敗也不踢，避免誤判
  }
  const dbToken = data?.active_session_token ?? null;

  if (dbToken && dbToken !== stored) {
    // DB 是其他設備的 token → 帳號已在其他設備登入（真被取代）→ 踢出（正確互斥）
    console.warn("[SSO] DB token 為其他設備，強制登出（帳號已在其他設備登入）");
    clearLocalSessionToken();
    setKickedOutFlag();
    await supabase.auth.signOut();
  }
  // 其餘情況（DB==自己 或 DB 為空）→ 正常線上，不踢
}

// ── Context ───────────────────────────────────────────────────────────────────
type SessionContextType = {
  session: Session | null;
  isLoading: boolean;
  /** 非 null 表示當前用戶已被封禁，需顯示封禁提示 Modal */
  bannedInfo: { msg: string } | null;
  clearBannedInfo: () => void;
};

const SessionContext = createContext<SessionContextType>({
  session:      null,
  isLoading:    true,
  bannedInfo:   null,
  clearBannedInfo: () => {},
});

/**
 * 查詢當前用戶是否處於有效封禁期
 * 返回 { banned: true, msg } 或 { banned: false, msg: "" }
 */
async function checkBanStatus(userId: string): Promise<{ banned: boolean; msg: string }> {
  try {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("user_bans")
      .select("expires_at, reason")
      .eq("user_id", userId)
      .eq("is_lifted", false)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const expireMsg = data.expires_at
        ? `（解封時間：${new Date(data.expires_at).toLocaleString("zh-TW")}）`
        : "（永久封禁）";
      return {
        banned: true,
        msg: `帳號已被限制使用${expireMsg}，如有疑問請聯絡客服`,
      };
    }
  } catch (e) {
    console.warn("[checkBanStatus] 查詢失敗:", e);
  }
  return { banned: false, msg: "" };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]       = useState<Session | null>(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [bannedInfo, setBannedInfo] = useState<{ msg: string } | null>(null);
  const appState = useRef(AppState.currentState);
  // 暴露 session setter 給 forceLocalSignOut 使用（模塊級）
  sessionSetter = setSession;

  /** 偵測到封禁時：儲存提示信息 → 清除本地 token → 登出（觸發 Stack.Protected 跳回登入頁） */
  const handleBanDetected = useCallback(async (msg: string) => {
    setBannedInfo({ msg });
    clearLocalSessionToken();
    await supabase.auth.signOut();
  }, []);

  const clearBannedInfo = useCallback(() => setBannedInfo(null), []);

  // ── 初始化 & Auth 狀態監聽 ────────────────────────────────────────────────
  useEffect(() => {
    // 取得現有 session，並立即校驗 SSO token + 封禁狀態
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      lastUserId = session?.user?.id ?? lastUserId;
      setIsLoading(false);
      if (session?.user?.id) {
        await validateSessionToken(session.user.id);
        // 初始化時檢查封禁（App 冷啟動場景）
        const { banned, msg } = await checkBanStatus(session.user.id);
        if (banned) { handleBanDetected(msg); }
      }
    });
    // 註：validateSessionToken 內部已含 refresh 降級，初始化無需額外 refresh

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session);
      lastUserId = session?.user?.id ?? lastUserId;
    });

    // iOS/Android 後臺掛起後回前臺：刷新 token + 校驗 SSO + 檢查封禁
    // 修復 X：回前台不再「refresh 失敗就無腦 signOut」，改由 validateSessionToken 統一降級處理
    const appStateSubscription = AppState.addEventListener('change', async (nextState) => {
      if (
        Platform.OS !== 'web' &&
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        if (session?.user?.id) {
          await validateSessionToken(session.user.id);
          // 回前台時順帶檢查封禁狀態
          const { banned, msg } = await checkBanStatus(session.user.id);
          if (banned) { handleBanDetected(msg); }
        }
      }
      appState.current = nextState;
    });

    return () => {
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [handleBanDetected]);

  // ── 輪詢：每 30 秒校驗 session token + 封禁狀態 ──────────────────────────
  // 踢出延遲 ≤30 秒，App 回前台立即校驗兜底
  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    const interval = setInterval(async () => {
      await validateSessionToken(userId);
      // 每輪詢週期同步檢查封禁（管理員手動封禁後 ≤30s 生效）
      const { banned, msg } = await checkBanStatus(userId);
      if (banned) { handleBanDetected(msg); }
    }, 30_000);

    return () => clearInterval(interval);
  }, [session?.user?.id, handleBanDetected]);

  return (
    <SessionContext.Provider value={{ session, isLoading, bannedInfo, clearBannedInfo }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

