"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from "../animate-icon";

type HeartHandshakeProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    heart: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 0.94, 1.05, 1],
        transition: { duration: 0.6, ease: "easeInOut" },
      },
    },
    hands: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0.25, 1],
        opacity: [0.55, 1],
        transition: { duration: 0.5, ease: "easeInOut", delay: 0.08 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: HeartHandshakeProps) {
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
      data-animate-ui-icon="heart-handshake"
      {...props}
    >
      <motion.path
        d="M19.4 14.4C21 12.8 22 11.5 22 9.5a5.5 5.5 0 0 0-9.6-3.7.6.6 0 0 1-.8 0A5.5 5.5 0 0 0 2 9.5C2 11.8 3.5 13.5 5 15l5.5 5.5a1.4 1.4 0 0 0 2 0l.8-.8"
        variants={variants.heart}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M4.5 12.5 7 10l3.5 3.5a1.4 1.4 0 0 0 2 0l.5-.5a1.4 1.4 0 0 0 0-2l-1-1 3-3"
        variants={variants.hands}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="m12 15-2-2m5 5-2-2m1-3-2-2m5 1-2-2"
        variants={variants.hands}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function HeartHandshake(props: HeartHandshakeProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  HeartHandshake,
  HeartHandshake as HeartHandshakeIcon,
  type HeartHandshakeProps,
  type HeartHandshakeProps as HeartHandshakeIconProps,
};
