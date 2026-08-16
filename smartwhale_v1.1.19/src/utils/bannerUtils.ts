/**
 * 輪播 Banner 核心工具函式
 * - filterCardBanners: 過濾出輪播型別（排除 festival 助力節）
 * - getNextBannerIndex: 計算下一幀索引（迴圈自增，越界歸零）
 * - getSafeBannerIndex: 修正當前索引（資料變化後防越界）
 */

export interface BannerItem {
  id: string;
  display_mode: string | null;
}

/**
 * 過濾出參與輪播的 Banner（display_mode !== 'festival'）
 */
export function filterCardBanners<T extends BannerItem>(banners: T[]): T[] {
  return banners.filter((b) => b.display_mode !== "festival");
}

/**
 * 計算下一個輪播索引（迴圈自增）
 * @param current 當前索引
 * @param total   輪播總數
 */
export function getNextBannerIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return (current + 1) % total;
}

/**
 * 修正當前索引（當 Banner 數量減少時防止越界）
 * @param current 當前索引
 * @param total   輪播總數
 */
export function getSafeBannerIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return current >= total ? 0 : current;
}
