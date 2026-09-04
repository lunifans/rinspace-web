import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { Button } from 'components/ui';

import { LanguageProvider, useLanguage } from './LanguageProvider';
import { i18n } from './index';

function Probe() {
  const { preference, resolvedLocale, setPreference, syncAccountPreference } = useLanguage();
  const identity = useRef(crypto.randomUUID());
  const [draft, setDraft] = useState('unsaved');
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="locale">{resolvedLocale}</span>
      <span data-testid="identity">{identity.current}</span>
      <input aria-label="draft" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
      <Button type="button" onClick={() => void setPreference('en')}>English</Button>
      <Button type="button" onClick={() => void setPreference('system')}>System</Button>
      <Button type="button" onClick={() => void syncAccountPreference('zh-CN')}>Account Chinese</Button>
      <Button type="button" onClick={() => void setPreference('en').catch(() => setFailed(true))}>Try English</Button>
      {failed ? <span>failed</span> : null}
    </div>
  );
}

describe('LanguageProvider', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('zh-CN');
    document.documentElement.lang = 'zh-CN';
  });

  it('switches in place without remounting or losing local state', async () => {
    render(<LanguageProvider><Probe /></LanguageProvider>);
    const identity = screen.getByTestId('identity').textContent;
    fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'keep this' } });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('en'));
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByTestId('identity').textContent).toBe(identity);
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('keep this');
  });

  it('reacts to languagechange only while following the system', async () => {
    const originalLanguages = Object.getOwnPropertyDescriptor(window.navigator, 'languages');
    Object.defineProperty(window.navigator, 'languages', { configurable: true, value: ['en-GB'] });
    render(<LanguageProvider><Probe /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('en'));

    Object.defineProperty(window.navigator, 'languages', { configurable: true, value: ['zh-SG'] });
    act(() => window.dispatchEvent(new Event('languagechange')));
    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('zh-CN'));

    if (originalLanguages) Object.defineProperty(window.navigator, 'languages', originalLanguages);
  });

  it('lets the account preference replace the device bootstrap preference', async () => {
    window.localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'en' }),
    );
    const firstDevice = render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('locale').textContent).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Account Chinese' }));
    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('zh-CN'));
    firstDevice.unmount();

    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('preference').textContent).toBe('zh-CN');
    expect(screen.getByTestId('locale').textContent).toBe('zh-CN');
  });

  it('keeps the last complete language when target resources fail', async () => {
    render(
      <LanguageProvider loadNamespaces={async () => { throw new Error('chunk unavailable'); }}>
        <Probe />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try English' }));
    await screen.findByText('failed');
    expect(screen.getByTestId('locale').textContent).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
