import type { ReactNode } from "react";

import { RinspaceBrandNavigation } from "./RinspaceBrandNavigation.js";
import type { RinspaceTopbarSlots, WorldShellPorts, WorldState } from "./types.js";

export type RinspaceTopbarProps = Readonly<{
  brandName: string;
  world: WorldState;
  currentHomeHref: string;
  flipHref: string;
  labels: Readonly<{
    flip: string;
    home: string;
    navigation: string;
  }>;
  brandMark?: ReactNode;
  brandWordmark?: ReactNode;
  slots?: RinspaceTopbarSlots;
  ports?: WorldShellPorts;
  className?: string;
}>;

export function RinspaceTopbar({
  brandName,
  world,
  currentHomeHref,
  flipHref,
  labels,
  brandMark,
  brandWordmark,
  slots,
  ports,
  className,
}: RinspaceTopbarProps) {
  const classes = ["rin-world-shell", className].filter(Boolean).join(" ");

  return (
    <header className={classes} data-rin-world={world}>
      <nav className="rin-world-shell__nav" aria-label={labels.navigation}>
        <RinspaceBrandNavigation
          brandName={brandName}
          world={world}
          currentHomeHref={currentHomeHref}
          flipHref={flipHref}
          labels={labels}
          brandMark={brandMark}
          wordmark={brandWordmark}
          ports={ports}
        />
        <span className="rin-world-shell__search">{slots?.search}</span>
        <span className="rin-world-shell__actions">
          {slots?.publishing}
          {slots?.notifications}
          {slots?.theme}
          {slots?.session}
        </span>
      </nav>
    </header>
  );
}
