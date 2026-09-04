'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '../animate-icon';

type CircleAlertProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    circle: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 0.92, 1.04, 1],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
    line: {
      initial: { y: 0 },
      animate: {
        y: [0, -1.5, 0.5, 0],
        transition: { duration: 0.55, ease: 'easeInOut' },
      },
    },
    dot: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [1, 0, 1.35, 1],
        opacity: [1, 0.35, 1, 1],
        transition: { duration: 0.55, ease: 'easeInOut', delay: 0.08 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: CircleAlertProps) {
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
      data-animate-ui-icon="circle-alert"
      {...props}
    >
      <motion.circle
        cx={12}
        cy={12}
        r={10}
        variants={variants.circle}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M12 8v4"
        variants={variants.line}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M12 16h.01"
        variants={variants.dot}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function CircleAlert(props: CircleAlertProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  CircleAlert,
  CircleAlert as CircleAlertIcon,
  type CircleAlertProps,
  type CircleAlertProps as CircleAlertIconProps,
};
