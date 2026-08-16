import { supabase } from "@/client/supabase";
import { ensureSessionReady } from "@/db/api";

/**
 * 統一封裝「需要當前使用者身份」的 RPC 呼叫。
 *
 * 這些 RPC（SECURITY DEFINER）內部會用 auth.uid() 校驗呼叫者身份，
 * 因此前端必須透過攜帶使用者 JWT 的 client 呼叫，並傳入與當前登入使用者一致的
 * p_user_id。本 helper 自動注入 p_user_id，避免各業務模組重複手動傳遞，
 * 保證認證參數的一致性與可維護性。
 *
 * @param name    RPC 函式名
 * @param params  業務參數（不含 p_user_id，會自動注入）
 * @param userId  當前登入使用者 ID
 */
export async function callAuthRpc<T = any>(
  name: string,
  params: Record<string, unknown>,
  userId: string,
): Promise<{ data: T | null; error: any }> {
  if (!userId) {
    return { data: null, error: { message: "未登入，無法執行操作" } };
  }
  // 確保 session/token 已就緒（登入後 AsyncStorage token 寫入為異步，首次進頁面可能尚未 ready → anon 請求被 RLS 拒絕返回 null）
  await ensureSessionReady();
  const { data, error } = await supabase.rpc(name, { p_user_id: userId, ...params });
  // 首次若因 session 未就緒返回空/錯誤，重試一次（等待 token 落盤後）
  if ((!data || error) && !data?.error) {
    await ensureSessionReady();
    const r2 = await supabase.rpc(name, { p_user_id: userId, ...params });
    return { data: r2.data as T | null, error: r2.error };
  }
  return { data: data as T | null, error };
}