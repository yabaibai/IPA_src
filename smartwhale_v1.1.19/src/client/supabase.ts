import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Native/Web 统一使用 AsyncStorage 作为 supabase auth 的 session 存储。
// ⚠️ 不能用浏览器全局 localStorage（RN 无此对象 → ReferenceError）。
// supabase-js v2 的 storage adapter 支持异步接口（getItem/setItem/removeItem 返回 Promise）。
const authStorage = AsyncStorage

// ⚠️ 直接指向后端地址（直连后端，更快更稳定）
// 后端地址：https://app.smartwhale.net
const SUPABASE_URL_HARDCODED = "https://base.smartwhale.net"
const supabaseUrl: string = SUPABASE_URL_HARDCODED
const supabaseAnonKey: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMDk3NTAxNjY5LCJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwic3ViIjoiYW5vbiJ9.ThPjT5TO4ZeS_MWf6O3U0waiF1IPy5fS-jtAeuvFAAQ'

// Edge Functions 基础地址（Auth / DB / Storage / Edge Functions 均直连后端）
export const functionsBase: string = supabaseUrl.replace(/\/$/, '') + '/functions/v1'
export const supabaseAnonKeyExport: string = supabaseAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage as unknown as Storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

/**
 * 調用 Edge Function
 *
 * 替代 supabase.functions.invoke()，自動帶上當前用戶 JWT。
 *
 * 用法：
 *   const data = await callFunction('password-login', { account, password })
 */
export async function callFunction<T = unknown>(
  functionName: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey,
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const res = await fetch(`${functionsBase}/${functionName}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw Object.assign(new Error(err.error || '請求失敗'), { status: res.status, data: err })
  }

  return res.json() as Promise<T>
}
