import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/client/supabase";

/**
 * 返回當前使用者「待處理轉賬訂單」數量：
 *   - pending_payment：雙方均提醒（傳送方需上傳憑證，接收方等待對方付款）
 *   - pending_confirm：雙方均提醒（接收方需確認，傳送方等待對方確認）
 *   - arbitration：雙方均提醒
 */
export function usePendingTransfers(userId: string) {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) { setPendingCount(0); return; }
    const { count } = await supabase
      .from("transfer_orders")
      .select("id", { count: "exact", head: true })
      .or(
        `and(sender_id.eq.${userId},status.eq.pending_payment),` +
        `and(receiver_id.eq.${userId},status.eq.pending_payment),` +
        `and(sender_id.eq.${userId},status.eq.pending_confirm),` +
        `and(receiver_id.eq.${userId},status.eq.pending_confirm),` +
        `and(sender_id.eq.${userId},status.eq.arbitration),` +
        `and(receiver_id.eq.${userId},status.eq.arbitration)`
      );
    setPendingCount(count ?? 0);
  }, [userId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return { pendingCount, refresh };
}
