"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from "../animate-icon";

type ArrowUpRightProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    arrow: {
      initial: { x: 0, y: 0 },
      animate: {
        x: [0, 2, 0],
        y: [0, -2, 0],
        transition: { duration: 0.45, ease: "easeInOut" },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ArrowUpRightProps) {
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
      data-animate-ui-icon="arrow-up-right"
      {...props}
    >
      <motion.g variants={variants.arrow} initial="initial" animate={controls}>
        <path d="M7 7h10v10" />
        <path d="M7 17 17 7" />
      </motion.g>
    </motion.svg>
  );
}

function ArrowUpRight(props: ArrowUpRightProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ArrowUpRight,
  ArrowUpRight as ArrowUpRightIcon,
  type ArrowUpRightProps,
  type ArrowUpRightProps as ArrowUpRightIconProps,
};
