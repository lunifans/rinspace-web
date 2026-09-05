import { resolveWorld } from "./resolver.js";
import type { WorldState } from "./types.js";

export type WorldTransitionDirection =
  | "outer-to-inner"
  | "inner-to-outer";

type PendingWorldTransition = Readonly<{
  version: 1;
  direction: WorldTransitionDirection;
  targetHref: string;
  createdAt: number;
  scrollX: number;
  scrollY: number;
  preserveScroll: boolean;
}>;

const storageKey = "rinspace:world-transition:v1";
const maximumPendingAge = 15_000;

function worldForHref(href: string): WorldState | null {
  return resolveWorld(href).world;
}

export function worldTransitionDirection(
  fromHref: string,
  toHref: string,
): WorldTransitionDirection | null {
  const from = worldForHref(fromHref);
  const to = worldForHref(toHref);
  if (!from || !to || from === to) return null;
  return from === "outer" ? "outer-to-inner" : "inner-to-outer";
}

function parsePending(value: string | null): PendingWorldTransition | null {
  if (!value) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate as Record<string, unknown>;
    if (
      record.version !== 1 ||
      (record.direction !== "outer-to-inner" &&
        record.direction !== "inner-to-outer") ||
      typeof record.targetHref !== "string" ||
      typeof record.createdAt !== "number" ||
      typeof record.scrollX !== "number" ||
      typeof record.scrollY !== "number" ||
      typeof record.preserveScroll !== "boolean"
    ) {
      return null;
    }
    return record as PendingWorldTransition;
  } catch {
    return null;
  }
}

function sameResource(from: URL, to: URL): boolean {
  return from.pathname === to.pathname;
}

function writePending(
  runtime: Window,
  targetHref: string,
  direction: WorldTransitionDirection,
): PendingWorldTransition {
  const from = new URL(runtime.location.href);
  const to = new URL(targetHref, from);
  const pending: PendingWorldTransition = {
    version: 1,
    direction,
    targetHref: to.href,
    createdAt: Date.now(),
    scrollX: runtime.scrollX,
    scrollY: runtime.scrollY,
    preserveScroll: sameResource(from, to),
  };
  runtime.document.documentElement.dataset.rinWorldTransition = direction;
  try {
    runtime.sessionStorage.setItem(storageKey, JSON.stringify(pending));
  } catch {
    // Storage may be unavailable in hardened browsers; navigation still works.
  }
  return pending;
}

export function prepareWorldFlipNavigation(
  targetHref: string,
  runtime: Window = window,
): WorldTransitionDirection | null {
  const direction = worldTransitionDirection(runtime.location.href, targetHref);
  if (!direction) return null;
  writePending(runtime, targetHref, direction);
  return direction;
}

function readIncomingPending(runtime: Window): PendingWorldTransition | null {
  let pending: PendingWorldTransition | null = null;
  try {
    pending = parsePending(runtime.sessionStorage.getItem(storageKey));
    runtime.sessionStorage.removeItem(storageKey);
  } catch {
    return null;
  }
  if (!pending || Date.now() - pending.createdAt > maximumPendingAge) return null;
  if (new URL(pending.targetHref).href !== runtime.location.href) return null;
  return pending;
}

function prefersReducedMotion(runtime: Window): boolean {
  return runtime.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function supportsCrossDocumentTransition(runtime: Window): boolean {
  const css = (runtime as Window & { CSS?: Pick<typeof CSS, "supports"> }).CSS;
  return (
    "onpagereveal" in runtime &&
    css?.supports("view-transition-name: none") === true
  );
}

function addTransitionType(
  transition: ViewTransition | null,
  direction: WorldTransitionDirection,
): void {
  const types: unknown = transition?.types;
  if (
    types &&
    typeof types === "object" &&
    "add" in types &&
    typeof types.add === "function"
  ) {
    types.add(direction);
  }
}

function settleIncomingPage(
  runtime: Window,
  pending: PendingWorldTransition | null,
): void {
  if (pending?.preserveScroll) {
    runtime.scrollTo({ left: pending.scrollX, top: pending.scrollY });
  } else {
    runtime.scrollTo({ left: 0, top: 0 });
  }
  const main = runtime.document.querySelector<HTMLElement>(
    "[data-rin-world-main], main",
  );
  if (main) {
    const hadTabIndex = main.hasAttribute("tabindex");
    if (!hadTabIndex) main.tabIndex = -1;
    main.focus({ preventScroll: true });
    if (!hadTabIndex) {
      main.addEventListener("blur", () => main.removeAttribute("tabindex"), {
        once: true,
      });
    }
  }
  delete runtime.document.documentElement.dataset.rinWorldTransition;
  delete runtime.document.documentElement.dataset.rinWorldTransitionFallback;
}

export function installWorldTransitionLifecycle(
  runtime: Window = window,
): () => void {
  let incoming = readIncomingPending(runtime);
  const settled = new Set<string>();
  const timers = new Set<number>();
  const transitionKey = (pending: PendingWorldTransition | null) =>
    pending
      ? `${pending.targetHref}:${pending.createdAt}`
      : `${runtime.location.href}:${Date.now()}`;
  const settleOnce = (
    pending: PendingWorldTransition | null,
    key: string,
  ) => {
    if (settled.has(key)) return;
    settled.add(key);
    settleIncomingPage(runtime, pending);
  };
  const scheduleSettlement = (
    pending: PendingWorldTransition | null,
    delay: number,
  ) => {
    const key = transitionKey(pending);
    const timer = runtime.setTimeout(() => {
      timers.delete(timer);
      settleOnce(pending, key);
    }, delay);
    timers.add(timer);
    return { key, settle: () => settleOnce(pending, key) };
  };
  const activateIncoming = (pending: PendingWorldTransition) => {
    runtime.document.documentElement.dataset.rinWorldTransition =
      pending.direction;
    const reduced = prefersReducedMotion(runtime);
    const supported = supportsCrossDocumentTransition(runtime);
    if (!reduced && !supported) {
      runtime.document.documentElement.dataset.rinWorldTransitionFallback =
        "true";
    }
    return scheduleSettlement(pending, reduced || !supported ? 240 : 650);
  };

  const initialSettlement = incoming ? activateIncoming(incoming) : null;

  const handlePageSwap = (event: PageSwapEvent) => {
    const targetHref = event.activation?.entry.url;
    if (!targetHref) return;
    const direction = worldTransitionDirection(runtime.location.href, targetHref);
    if (!direction) return;
    writePending(runtime, targetHref, direction);
    addTransitionType(event.viewTransition, direction);
  };

  const handlePageReveal = (event: PageRevealEvent) => {
    const pending = incoming ?? readIncomingPending(runtime);
    incoming = null;
    const activation = (
      runtime as Window & {
        navigation?: {
          activation?: {
            from?: { url: string } | null;
          };
        };
      }
    ).navigation?.activation;
    const fromHref = activation?.from?.url;
    const direction = fromHref
      ? worldTransitionDirection(fromHref, runtime.location.href)
      : pending?.direction ?? null;
    if (!direction && !pending) return;
    if (direction) {
      runtime.document.documentElement.dataset.rinWorldTransition = direction;
      addTransitionType(event.viewTransition, direction);
    }
    const settlement = pending
      ? initialSettlement ?? activateIncoming(pending)
      : scheduleSettlement(null, 650);
    if (event.viewTransition) {
      void event.viewTransition.finished.finally(settlement.settle);
    }
  };

  runtime.addEventListener("pageswap", handlePageSwap);
  runtime.addEventListener("pagereveal", handlePageReveal);
  const earlyRevealRuntime = runtime as Window & {
    __rinspacePendingPageReveal?: PageRevealEvent;
  };
  const earlyReveal = earlyRevealRuntime.__rinspacePendingPageReveal;
  if (earlyReveal) {
    delete earlyRevealRuntime.__rinspacePendingPageReveal;
    handlePageReveal(earlyReveal);
  }

  return () => {
    runtime.removeEventListener("pageswap", handlePageSwap);
    runtime.removeEventListener("pagereveal", handlePageReveal);
    for (const timer of timers) runtime.clearTimeout(timer);
    timers.clear();
  };
}
