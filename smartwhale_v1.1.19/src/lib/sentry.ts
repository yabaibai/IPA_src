// 通用回退（TypeScript 型別基礎）
// Metro 執行時優先選擇 sentry.native.ts / sentry.web.ts
import type React from 'react';

export function initSentry(): void {
  // 通用回退：no-op
}

export function wrapWithSentry<T extends React.ComponentType<Record<string, never>>>(component: T): T {
  return component;
}
