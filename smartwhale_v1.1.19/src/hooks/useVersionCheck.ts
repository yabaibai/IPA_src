/**
 * useVersionCheck
 * App 啟動後從 system_config 讀取最新版本號和最低支援版本，與本地版本比對。
 * - showUpdate=true：有新版本可選擇更新
 * - forceUpdate=true：本地版本低於最低版本，必須強制更新
 */
import { useState, useEffect } from "react";
import Constants from "expo-constants";
import { supabase } from "@/client/supabase";

// 解析 semver 字串為數字陣列，如 "1.0.110" → [1, 0, 110]
function parseSemver(v: string): number[] {
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

// 如果 remote > local 則返回 true
function isNewer(local: string, remote: string): boolean {
  const l = parseSemver(local);
  const r = parseSemver(remote);
  const len = Math.max(l.length, r.length);
  for (let i = 0; i < len; i++) {
    const lv = l[i] ?? 0;
    const rv = r[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

export function useVersionCheck() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState("");
  const [apkUrl, setApkUrl] = useState("");
  const localVersion = Constants.expoConfig?.version ?? "1.0.0";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("system_config")
          .select("config_key, config_val")
          .in("config_key", ["app_latest_version", "app_android_apk_url", "app_min_version"]);
        if (cancelled || error || !data) return;
        const map = Object.fromEntries(
          data.map((r: { config_key: string; config_val: string }) => [r.config_key, r.config_val])
        );
        const remote = String(map["app_latest_version"] ?? "").trim();
        const minVer = String(map["app_min_version"] ?? "").trim();
        const url = String(map["app_android_apk_url"] ?? "").trim();
        if (url) setApkUrl(url);
        // 強制更新：本地版本低於最低版本要求
        if (minVer && isNewer(localVersion, minVer)) {
          setLatestVersion(remote || minVer);
          setForceUpdate(true);
          setShowUpdate(true);
          return;
        }
        // 普通更新提示
        if (remote && isNewer(localVersion, remote)) {
          setLatestVersion(remote);
          setShowUpdate(true);
        }
      } catch {
        // 網路異常靜默處理，不影響正常使用
      }
    })();
    return () => { cancelled = true; };
  }, []); // 僅 App 掛載時執行一次

  // 強制更新不允許 dismiss
  const dismiss = () => { if (!forceUpdate) setShowUpdate(false); };

  return { showUpdate, forceUpdate, latestVersion, localVersion, apkUrl, dismiss };
}
