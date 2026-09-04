import { AnimateButton } from 'components/ui';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ThemeProvider, useTheme } from './ThemeProvider';

function ThemeFixture() { const theme = useTheme(); return <AnimateButton unstyled onClick={() => theme.setPreference(theme.preference === 'dark' ? 'light' : 'dark')}>{theme.preference}:{theme.resolved}</AnimateButton>; }

describe('ThemeProvider', () => {
  it('persists a versioned preference and applies it to the root', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<ThemeProvider><ThemeFixture /></ThemeProvider>);
    await user.click(screen.getByRole('button'));
    expect(window.localStorage.getItem('rinspace-theme-v2')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('reacts to system preference changes in system mode', () => {
    window.localStorage.setItem('rinspace-theme-v2', 'system');
    act(() => render(<ThemeProvider><ThemeFixture /></ThemeProvider>));
    expect(screen.getByRole('button').textContent).toContain('system:light');
  });
});
