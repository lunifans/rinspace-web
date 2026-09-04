import { useEffect, useMemo } from 'react';

import type { RinPageContextSnapshot } from '@/types/rinPageContext';

export function useRinPageContext(snapshot: RinPageContextSnapshot | undefined) {
  const buildSnapshot = useMemo(() => () => snapshot, [snapshot]);

  useEffect(() => {
    if (!snapshot) {
      delete window.__rinspacePageContext;
      delete window.__rinspaceBuildPageContext;
      window.dispatchEvent(new CustomEvent('rinspace:page-context'));
      return undefined;
    }

    window.__rinspaceBuildPageContext = buildSnapshot;
    window.__rinspacePageContext = snapshot;
    window.dispatchEvent(new CustomEvent('rinspace:page-context'));

    return () => {
      if (window.__rinspacePageContext === snapshot) {
        delete window.__rinspacePageContext;
      }
      if (window.__rinspaceBuildPageContext === buildSnapshot) {
        delete window.__rinspaceBuildPageContext;
      }
      window.dispatchEvent(new CustomEvent('rinspace:page-context'));
    };
  }, [buildSnapshot, snapshot]);
}
