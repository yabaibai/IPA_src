import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

// Colors mirror global.css variables exactly
export const THEME = {
  light: {
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(0 0% 3.9%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(0 0% 3.9%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(0 0% 3.9%)',
    primary: 'hsl(0 0% 9%)',
    primaryForeground: 'hsl(0 0% 98%)',
    secondary: 'hsl(0 0% 96.1%)',
    secondaryForeground: 'hsl(0 0% 9%)',
    muted: 'hsl(0 0% 96.1%)',
    mutedForeground: 'hsl(0 0% 45.1%)',
    accent: 'hsl(0 0% 96.1%)',
    accentForeground: 'hsl(0 0% 9%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    border: 'hsl(0 0% 89.8%)',
    input: 'hsl(0 0% 89.8%)',
    ring: 'hsl(0 0% 3.9%)',
    radius: '0.5rem',
  },
  dark: {
    background: 'hsl(237 67% 10%)',     /* #0A0F2E */
    foreground: 'hsl(210 40% 98%)',
    card: 'hsl(239 60% 13%)',           /* #0D1130 */
    cardForeground: 'hsl(210 40% 98%)',
    popover: 'hsl(239 60% 13%)',
    popoverForeground: 'hsl(210 40% 98%)',
    primary: 'hsl(239 84% 67%)',        /* #6366F1 indigo */
    primaryForeground: 'hsl(210 40% 98%)',
    secondary: 'hsl(258 88% 66%)',      /* #8B5CF6 violet */
    secondaryForeground: 'hsl(210 40% 98%)',
    muted: 'hsl(240 30% 18%)',
    mutedForeground: 'hsl(215 20% 55%)',
    accent: 'hsl(258 88% 66%)',
    accentForeground: 'hsl(210 40% 98%)',
    destructive: 'hsl(350 90% 60%)',
    destructiveForeground: 'hsl(210 40% 98%)',
    border: 'hsl(258 56% 26%)',         /* #2D1B69 */
    input: 'hsl(258 56% 26%)',
    ring: 'hsl(239 84% 67%)',
    radius: '0.5rem',
  },
};

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};
