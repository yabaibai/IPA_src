// Web 環境：空 mock，不引入任何 native 模組
import type React from 'react';

export function initSentry() {
  // Web 預覽不支援 Sentry，跳過
}

export function wrapWithSentry<T extends React.ComponentType<Record<string, never>>>(component: T): T {
  return component;
}
