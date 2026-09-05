import type { MouseEvent, ReactNode } from "react";

import type {
  WorldNavigationReason,
  WorldShellPorts,
  WorldState,
} from "./types.js";

export type RinspaceBrandClassNames = Readonly<{
  root?: string;
  logo?: string;
  logoContent?: string;
  wordmark?: string;
}>;

export type RinspaceBrandNavigationProps = Readonly<{
  brandName: string;
  world: WorldState;
  currentHomeHref: string;
  flipHref: string;
  labels: Readonly<{
    flip: string;
    home: string;
  }>;
  brandMark?: ReactNode;
  wordmark?: ReactNode;
  ports?: WorldShellPorts;
  classNames?: RinspaceBrandClassNames;
}>;

function classList(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function plainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function RinspaceBrandNavigation({
  brandName,
  world,
  currentHomeHref,
  flipHref,
  labels,
  brandMark,
  wordmark,
  ports,
  classNames,
}: RinspaceBrandNavigationProps) {
  const navigate =
    (reason: WorldNavigationReason, href: string) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || !plainPrimaryClick(event)) return;
      const handled = ports?.navigation?.navigate({ href, reason, world });
      if (handled === true) event.preventDefault();
    };

  return (
    <span
      className={classList("rin-world-shell__brand", classNames?.root)}
      data-rin-world={world}
    >
      <a
        className={classList("rin-world-shell__logo", classNames?.logo)}
        href={flipHref}
        aria-label={labels.flip}
        data-rin-world-action="flip"
        onClick={navigate("flip", flipHref)}
      >
        <span
          className={classList(
            "rin-world-shell__logo-content",
            classNames?.logoContent,
          )}
          aria-hidden="true"
        >
          {brandMark ?? brandName.slice(0, 1)}
        </span>
      </a>
      <a
        className={classList("rin-world-shell__wordmark", classNames?.wordmark)}
        href={currentHomeHref}
        aria-label={labels.home}
        data-rin-world-action="current-home"
        onClick={navigate("current-home", currentHomeHref)}
      >
        {wordmark ?? brandName}
      </a>
    </span>
  );
}
