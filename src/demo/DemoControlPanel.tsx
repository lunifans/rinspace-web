import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useOptionalBootstrap } from '@/app/bootstrap/context';
import type { DemoPersona } from '@/app/bootstrap/types';
import { AnimateButton } from '@/components/ui';
import {
  getDemoRepositoryRuntime,
  type DemoMetaRecord,
} from '@/demo/repository';
import {
  demoScenarioNames,
  demoScenarioStorageKey,
  parseDemoScenario,
  type DemoScenarioName,
} from '@/demo/mock/scenarios';
import { useAuthAdapter, useAuthSnapshot } from '@/platform/auth/context';
import { productionCapabilityCatalog } from './productionCapabilities';

export const demoDataResetEventName = 'rinspace:demo-data-reset';

function readScenario(): DemoScenarioName {
  try {
    return parseDemoScenario(window.localStorage.getItem(demoScenarioStorageKey));
  } catch {
    return 'normal';
  }
}

function currentPersona(status: ReturnType<typeof useAuthSnapshot>['status']): DemoPersona {
  return status === 'authenticated' ? 'member' : 'guest';
}

export default function DemoControlPanel() {
  const { t } = useTranslation('common');
  const bootstrap = useOptionalBootstrap();
  const auth = useAuthAdapter();
  const snapshot = useAuthSnapshot();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState<DemoScenarioName>(readScenario);
  const [metadata, setMetadata] = useState<DemoMetaRecord | null>(null);
  const [status, setStatus] = useState('');
  const isDemo = bootstrap?.config.mode === 'demo';
  const persona = currentPersona(snapshot.status);

  const refreshMetadata = useCallback(async () => {
    const repository = getDemoRepositoryRuntime();
    setMetadata(repository ? await repository.getMetadata() : null);
  }, []);

  useEffect(() => {
    if (!isDemo || !open) return undefined;
    void refreshMetadata();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === demoScenarioStorageKey) setScenario(parseDemoScenario(event.newValue));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isDemo, open, refreshMetadata]);

  const directLinks = (() => {
    if (typeof window === 'undefined') return { guest: '?demoPersona=guest', member: '?demoPersona=member' };
    const linkFor = (nextPersona: DemoPersona) => {
      const url = new URL(window.location.href);
      url.searchParams.set('demoPersona', nextPersona);
      return `${url.pathname}${url.search}${url.hash}`;
    };
    return { guest: linkFor('guest'), member: linkFor('member') };
  })();

  if (!isDemo) return null;

  const changePersona = (nextPersona: DemoPersona) => {
    auth.setDemoPersona?.(nextPersona);
    setStatus(t('demo.personaChanged', { persona: t(`demo.personas.${nextPersona}`) }));
  };

  const changeScenario = (nextScenario: DemoScenarioName) => {
    try {
      window.localStorage.setItem(demoScenarioStorageKey, nextScenario);
      setScenario(nextScenario);
      setStatus(t('demo.scenarioChanged', { scenario: t(`demo.scenarios.${nextScenario}`) }));
    } catch {
      setStatus(t('demo.storageUnavailable'));
    }
  };

  const resetDemoData = async () => {
    const repository = getDemoRepositoryRuntime();
    if (!repository) {
      setStatus(t('demo.resetUnavailable'));
      return;
    }
    setBusy(true);
    setStatus(t('demo.resetting'));
    try {
      const { createRinspaceDemoSeed } = await import('@/demo/fixtures/v1');
      await repository.reset(await createRinspaceDemoSeed());
      await auth.restore();
      window.localStorage.setItem(demoScenarioStorageKey, 'normal');
      setScenario('normal');
      await refreshMetadata();
      window.dispatchEvent(new CustomEvent(demoDataResetEventName));
      setStatus(t('demo.resetComplete'));
    } catch {
      setStatus(t('demo.resetFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="rin-demo-control"
      data-rin-demo-controls="true"
      data-open={open ? 'true' : 'false'}
      data-persona={persona}
    >
      {open ? (
        <section
          className="rin-demo-control-panel"
          aria-labelledby="rin-demo-control-title"
        >
          <header>
            <div>
              <span>{t('demo.badge')}</span>
              <h2 id="rin-demo-control-title">{t('demo.title')}</h2>
            </div>
            <AnimateButton
              unstyled
              type="button"
              className="rin-demo-control-icon"
              aria-label={t('demo.closeControls')}
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </AnimateButton>
          </header>

          <p className="rin-demo-control-description">{t('demo.description')}</p>

          <fieldset className="rin-demo-persona-control">
            <legend>{t('demo.persona')}</legend>
            {(['guest', 'member'] as const).map((option) => (
              <AnimateButton
                unstyled
                key={option}
                type="button"
                data-rin-demo-persona-option={option}
                aria-pressed={persona === option}
                onClick={() => changePersona(option)}
              >
                {t(`demo.personas.${option}`)}
              </AnimateButton>
            ))}
          </fieldset>

          <label className="rin-demo-scenario-control" htmlFor="rin-demo-scenario">
            <span>{t('demo.scenario')}</span>
            <select
              id="rin-demo-scenario"
              data-rin-demo-scenario="true"
              value={scenario}
              disabled={busy}
              onChange={(event) => changeScenario(parseDemoScenario(event.currentTarget.value))}
            >
              {demoScenarioNames.map((name) => (
                <option key={name} value={name}>{t(`demo.scenarios.${name}`)}</option>
              ))}
            </select>
          </label>

          <AnimateButton
            unstyled
            type="button"
            className="rin-demo-reset"
            data-rin-demo-reset="true"
            disabled={busy}
            onClick={() => void resetDemoData()}
          >
            <RotateCcw aria-hidden="true" />
            {busy ? t('demo.resetting') : t('demo.reset')}
          </AnimateButton>

          <details className="rin-demo-diagnostics" onToggle={() => void refreshMetadata()}>
            <summary>{t('demo.diagnostics')}</summary>
            <dl>
              <div><dt>{t('demo.mode')}</dt><dd>{bootstrap.config.mode}</dd></div>
              <div><dt>{t('demo.basePath')}</dt><dd>{bootstrap.config.basePath}</dd></div>
              <div><dt>{t('demo.worker')}</dt><dd>{bootstrap.modeRuntime.demoWorkerReady ? t('demo.ready') : t('demo.notReady')}</dd></div>
              <div><dt>{t('demo.dataset')}</dt><dd data-rin-demo-dataset="true">{metadata?.datasetVersion ?? t('demo.notReady')}</dd></div>
              <div><dt>{t('demo.checksum')}</dt><dd>{metadata?.checksum ?? t('demo.notReady')}</dd></div>
            </dl>
            <nav aria-label={t('demo.directLinks')}>
              <a href={directLinks.guest}>{t('demo.guestLink')}</a>
              <a href={directLinks.member}>{t('demo.memberLink')}</a>
            </nav>
          </details>

          <details className="rin-demo-capabilities">
            <summary>{t('demo.capabilities.title')}</summary>
            <p>{t('demo.capabilities.description')}</p>
            <ul>
              {productionCapabilityCatalog.map((capability) => (
                <li key={capability.id} data-rin-demo-capability-state={capability.state}>
                  <strong>{t(`demo.capabilities.items.${capability.id}.title`)}</strong>
                  <span>{t(`demo.capabilities.states.${capability.state}`)}</span>
                  <small>{t(`demo.capabilities.items.${capability.id}.recovery`)}</small>
                </li>
              ))}
            </ul>
          </details>

          {status ? <p className="rin-demo-control-status" role="status">{status}</p> : null}
        </section>
      ) : null}

      <AnimateButton
        unstyled
        type="button"
        className="rin-demo-badge"
        data-rin-demo-badge="true"
        aria-expanded={open}
        aria-controls="rin-demo-control-title"
        aria-label={t('demo.openControls')}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal aria-hidden="true" />
        <span>{t('demo.badge')}</span>
        <strong>{t(`demo.personas.${persona}`)}</strong>
      </AnimateButton>
    </aside>
  );
}
