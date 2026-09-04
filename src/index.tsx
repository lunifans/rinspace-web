import React from 'react';

import 'katex/dist/katex.min.css';

import App from './App';
import { BootstrapProvider } from './app/bootstrap/context';
import { startApplication } from './app/bootstrap/start';
import './styles/index.css';

const handleImgLoad = (evt: Event | UIEvent) => {
  const { target } = evt;

  if (target === null || !(target instanceof Element)) {
    return;
  }
  if (!/IMG/i.test(target.nodeName)) {
    return;
  }

  if (/error/i.test(evt.type)) {
    target.classList.add('broken');
    const attrSrc = target.getAttribute('src');
    const attrAlt = target.getAttribute('alt')?.trim();
    if (attrSrc && !attrAlt) {
      target.classList.add('invisible');
    }
  }

  if (/load/i.test(evt.type)) {
    target.classList.remove('broken', 'invisible');
  }
};

const handleClickLink = (evt: Event) => {
  const { target } = evt;

  if (target === null || !(target instanceof Element)) {
    return;
  }
  if (!/A/i.test(target.nodeName)) {
    return;
  }

  if (/\/(?:rinspace\/)?api\//.test(target.getAttribute('href') || '')) {
    evt.preventDefault();
    window.location.href = target.getAttribute('href') || '';
  }
};

document.addEventListener('error', handleImgLoad, true);
document.addEventListener('load', handleImgLoad, true);
document.addEventListener('click', handleClickLink, true);

const rootElement = document.getElementById('root');
if (!(rootElement instanceof HTMLElement)) throw new Error('Rinspace root element is missing.');

void startApplication({
  rootElement,
  renderApplication: (bootstrap) => (
    <React.StrictMode>
      <BootstrapProvider value={bootstrap}>
        <App />
      </BootstrapProvider>
    </React.StrictMode>
  ),
});
