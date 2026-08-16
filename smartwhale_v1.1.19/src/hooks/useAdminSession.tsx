import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/client/supabase";
import { callAuthRpc } from "@/lib/rpc";
import { signOutCleanly } from "@/ctx";

export type AdminRole = "superadmin" | "ops" | "finance" | "customer_service" | "auditor";

export interface AdminInfo {
  userId: string;   // auth.uid() = admin_users.user_id
  adminId: string;  // admin_users.id（主鍵，用於 admin_logs 過濾）
  name: string;
  email: string;
  role: AdminRole;
}

interface AdminSessionCtx {
  admin: AdminInfo | null;
  isLoading: boolean;
  /** 檢查當前管理員是否具備指定角色許可權（superadmin 始終有權） */
  hasRole: (...roles: AdminRole[]) => boolean;
  signOut: () => Promise<void>;
}

const AdminContext = createContext<AdminSessionCtx>({
  admin: null,
  isLoading: true,
  hasRole: () => false,
  signOut: async () => {},
});

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAdmin = useCallback(async (userId: string) => {
    // 使用 SECURITY DEFINER 函式繞過 RLS 遞迴策略，確保登入後能正確載入管理員資訊
    const { data: rows } = await callAuthRpc("get_admin_info_for_login", {}, userId);
    const data = rows?.[0] ?? null;
    if (data && data.is_active) {
      // email 從 auth session 獲取（get_admin_info_for_login 不返回 email 欄位）
      const { data: { session } } = await supabase.auth.getSession();
      setAdmin({
        userId,
        adminId: data.id,
        name: data.name ?? session?.user?.email ?? userId,
        email: session?.user?.email ?? "",
        role: data.admin_role as AdminRole,
      });
    } else {
      setAdmin(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadAdmin(session.user.id);
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadAdmin(session.user.id);
      } else {
        setAdmin(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadAdmin]);

  const hasRole = useCallback((...roles: AdminRole[]): boolean => {
    if (!admin) return false;
    if (admin.role === "superadmin") return true;
    return roles.includes(admin.role);
  }, [admin]);

  const signOut = useCallback(async () => {
    await signOutCleanly();
    setAdmin(null);
  }, []);

  return (
    <AdminContext.Provider value={{ admin, isLoading, hasRole, signOut }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminSession() {
  return useContext(AdminContext);
}
