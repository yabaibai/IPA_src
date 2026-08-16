// 首页 Banner 数据获取（独立文件，便于单测且不依赖 api.ts 其他预存类型问题）
import { supabase } from "@/client/supabase";

export async function getBanners(): Promise<import("@/types/types").HomeBanner[] | null> {
  const { data, error } = await supabase
    .from("banners")
    .select("id,title,subtitle,emoji,tag,tag_color,accent_color,banner_image_url,display_mode,sort_order,is_active,content_detail,date_range,cta_text")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) return null; // 请求失败（超时/网络错误）→ 返回 null，让上层保留旧 banner，不闪空
  return Array.isArray(data) ? data : []; // 成功但无数据 → 真无 banner → 清空
}
