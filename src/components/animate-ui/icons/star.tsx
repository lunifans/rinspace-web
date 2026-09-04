'use client';

import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '../animate-icon';

type StarProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: {
        rotate: [0, -10, 8, 0],
        scale: [1, 0.88, 1.14, 1],
        transformOrigin: 'center',
        transition: { duration: 0.46, ease: 'easeInOut' },
      },
    },
    path: {},
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: StarProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      variants={variants.group}
      initial="initial"
      animate={controls}
      data-animate-ui-icon="star"
      {...props}
    >
      <motion.path
        d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.164.75a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.968 0L6.398 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879l-3.735-3.638a.53.53 0 0 1 .294-.906l5.165-.75a2.12 2.12 0 0 0 1.594-1.16z"
        variants={variants.path}
      />
    </motion.svg>
  );
}

function Star(props: StarProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, Star, Star as StarIcon, type StarProps };
