import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';
import { useCallback, useState, type ComponentProps } from 'react';

import { getStrictContext } from './strict-context';

type ControlledOpen = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?(open: boolean): void;
};

const [HoverCardProvider, useHoverCard] = getStrictContext<{ isOpen: boolean }>('AnimateHoverCard');

export type AnimateHoverCardProps = ComponentProps<typeof HoverCardPrimitive.Root>;

/**
 * Motion wrapper adapted from Rinspace's pinned Animate UI Hover Card source.
 * Radix owns intent, focus, collision and pointer-transit behavior; Motion only
 * animates the mounted surface.
 */
export function AnimateHoverCard(props: AnimateHoverCardProps) {
  const { defaultOpen, onOpenChange, open } = props as ControlledOpen;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false);
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <HoverCardProvider value={{ isOpen }}>
      <HoverCardPrimitive.Root {...props} onOpenChange={setOpen} />
    </HoverCardProvider>
  );
}

export const AnimateHoverCardTrigger = HoverCardPrimitive.Trigger;
export const AnimateHoverCardArrow = HoverCardPrimitive.Arrow;

export type AnimateHoverCardContentProps = HTMLMotionProps<'div'> & {
  align?: ComponentProps<typeof HoverCardPrimitive.Content>['align'];
  alignOffset?: ComponentProps<typeof HoverCardPrimitive.Content>['alignOffset'];
  side?: ComponentProps<typeof HoverCardPrimitive.Content>['side'];
  sideOffset?: ComponentProps<typeof HoverCardPrimitive.Content>['sideOffset'];
  avoidCollisions?: ComponentProps<typeof HoverCardPrimitive.Content>['avoidCollisions'];
  collisionBoundary?: ComponentProps<typeof HoverCardPrimitive.Content>['collisionBoundary'];
  collisionPadding?: ComponentProps<typeof HoverCardPrimitive.Content>['collisionPadding'];
  sticky?: ComponentProps<typeof HoverCardPrimitive.Content>['sticky'];
  hideWhenDetached?: ComponentProps<typeof HoverCardPrimitive.Content>['hideWhenDetached'];
};

export function AnimateHoverCardContent({
  align = 'start',
  sideOffset = 8,
  alignOffset,
  side,
  avoidCollisions,
  collisionBoundary,
  collisionPadding = 12,
  sticky,
  hideWhenDetached,
  transition = { type: 'spring', stiffness: 300, damping: 25 },
  ...props
}: AnimateHoverCardContentProps) {
  const { isOpen } = useHoverCard();

  return (
    <AnimatePresence>
      {isOpen ? (
        <HoverCardPrimitive.Portal forceMount>
          <HoverCardPrimitive.Content
            asChild
            forceMount
            align={align}
            alignOffset={alignOffset}
            side={side}
            sideOffset={sideOffset}
            avoidCollisions={avoidCollisions}
            collisionBoundary={collisionBoundary}
            collisionPadding={collisionPadding}
            sticky={sticky}
            hideWhenDetached={hideWhenDetached}
          >
            <motion.div
              data-slot="hover-card-content"
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -2 }}
              transition={transition}
              {...props}
            />
          </HoverCardPrimitive.Content>
        </HoverCardPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}
