import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

export interface AnimateIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon: ReactNode;
  label: string;
}

/** Intent animation derived from Animate UI's animated Lucide control pattern. */
export const AnimateIconButton = forwardRef<HTMLButtonElement, AnimateIconButtonProps>(function AnimateIconButton(
  { active = false, className = '', icon, label, type = 'button', ...props },
  ref,
) {
  const motionProps = props as Omit<HTMLMotionProps<'button'>, 'children'>;
  return (
    <motion.button
      ref={ref}
      aria-label={label}
      aria-pressed={props.onClick ? active : undefined}
      className={`rin-animate-icon-button ${className}`.trim()}
      data-active={active || undefined}
      type={type}
      whileHover="hover"
      whileTap="tap"
      initial={false}
      {...motionProps}
    >
      <motion.span
        aria-hidden="true"
        variants={{ hover: { rotate: active ? -6 : 6, scale: 1.08 }, tap: { scale: 0.86 } }}
        transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      >
        {icon}
      </motion.span>
    </motion.button>
  );
});
