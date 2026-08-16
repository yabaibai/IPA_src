/**
 * 圖片上傳大小校驗工具函式
 *
 * 提取自 personal-info.tsx（頭像）和 payment-methods.tsx（收款碼）中的校驗邏輯，
 * 以純函式形式封裝，便於單元測試和複用。
 */

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const IMAGE_SIZE_ERROR_MSG = "圖片不能超過 5MB，請選擇更小的圖片";

/**
 * 第一道校驗：檢查 ImagePickerAsset.fileSize（原始檔案大小）
 *
 * @param fileSize asset.fileSize，可能為 null/undefined（系統未提供時）
 * @param maxBytes 最大允許位元組數，預設 IMAGE_MAX_BYTES
 * @returns true = 超限應攔截；false = 允許繼續
 */
export function exceedsFileSizeLimit(
  fileSize: number | null | undefined,
  maxBytes: number = IMAGE_MAX_BYTES,
): boolean {
  // fileSize 為 null/undefined/0 時跳過（由第二道 blob 校驗兜底）
  if (!fileSize) return false;
  return fileSize > maxBytes;
}

/**
 * 第二道校驗：檢查實際讀取的 blob/buffer 大小
 * 用於 fileSize 為 null 或壓縮後仍偏大的情況
 *
 * @param blobSize blob.size 或 buffer.byteLength
 * @param maxBytes 最大允許位元組數，預設 IMAGE_MAX_BYTES
 * @returns true = 超限應攔截；false = 允許繼續
 */
export function exceedsBlobSizeLimit(
  blobSize: number,
  maxBytes: number = IMAGE_MAX_BYTES,
): boolean {
  return blobSize > maxBytes;
}
