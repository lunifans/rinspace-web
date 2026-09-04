import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

export type AnimateButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'destructive';
export type AnimateButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface AnimateButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AnimateButtonVariant;
  size?: AnimateButtonSize;
  leadingIcon?: ReactNode;
  /** Preserve an established product composition while adopting Animate UI motion semantics. */
  unstyled?: boolean;
}

/**
 * Rinspace-owned adaptation of Animate UI's copy-first button contract.
 * Source basis: pinned `components/buttons/button` and `primitives/buttons/button`.
 */
export const AnimateButton = forwardRef<HTMLButtonElement, AnimateButtonProps>(function AnimateButton(
  { children, className = '', leadingIcon, size = 'md', type = 'button', unstyled = false, variant = 'secondary', ...props },
  ref,
) {
  const motionProps = props as Omit<HTMLMotionProps<'button'>, 'children'>;
  return (
    <motion.button
      ref={ref}
      className={`${unstyled ? '' : 'rin-ui-button rin-animate-button'} ${className}`.trim()}
      data-size={size}
      data-variant={variant}
      type={type}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.975, y: 0 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      {...motionProps}
    >
      {leadingIcon ? <span className="rin-animate-button__icon" aria-hidden="true">{leadingIcon}</span> : null}
      {children}
    </motion.button>
  );
});
