// Native 環境：使用真實 @sentry/react-native
import * as Sentry from '@sentry/react-native';

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (dsn) Sentry.init({ dsn });
}

export function wrapWithSentry<T extends React.ComponentType<Record<string, never>>>(component: T): T {
  return Sentry.wrap(component) as T;
}
