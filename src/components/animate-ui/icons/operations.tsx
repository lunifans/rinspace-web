'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import { getVariants, IconWrapper, type IconProps, useAnimateIconContext } from '../animate-icon';

type OperationsIconProps = IconProps<'default'>;

const draw = {
  initial: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0.35, 1],
    transition: { duration: 0.48, ease: 'easeInOut' },
  },
} satisfies Variants;

const rotate = {
  initial: { rotate: 0 },
  animate: {
    rotate: 180,
    transition: { type: 'spring', stiffness: 260, damping: 20 },
  },
} satisfies Variants;

const pulse = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 0.82, 1.08, 1],
    transition: { duration: 0.5, ease: 'easeInOut' },
  },
} satisfies Variants;

function FilterIcon({ size, ...props }: OperationsIconProps) {
  const { controls } = useAnimateIconContext();
  return (
    <motion.svg data-animate-ui-icon="filter" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.path d="M4 5h16" variants={draw} initial="initial" animate={controls} />
      <motion.path d="M7 12h10" variants={draw} initial="initial" animate={controls} />
      <motion.path d="M10 19h4" variants={draw} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function ShieldIcon({ size, ...props }: OperationsIconProps) {
  const { controls } = useAnimateIconContext();
  return (
    <motion.svg data-animate-ui-icon="shield-check" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z" variants={draw} initial="initial" animate={controls} />
      <motion.path d="m9 12 2 2 4-4" variants={pulse} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function HistoryIcon({ size, ...props }: OperationsIconProps) {
  const { controls } = useAnimateIconContext();
  return (
    <motion.svg data-animate-ui-icon="history" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.path d="M3 12a9 9 0 1 0 3-6.7L3 8" variants={draw} initial="initial" animate={controls} />
      <motion.path d="M3 3v5h5" variants={draw} initial="initial" animate={controls} />
      <motion.path d="M12 7v5l3 2" variants={rotate} initial="initial" animate={controls} style={{ transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}

function GitCommitIcon({ size, ...props }: OperationsIconProps) {
  const { controls } = useAnimateIconContext();
  return (
    <motion.svg data-animate-ui-icon="git-commit" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <motion.path d="M2 12h6" variants={draw} initial="initial" animate={controls} />
      <motion.circle cx="12" cy="12" r="4" variants={pulse} initial="initial" animate={controls} />
      <motion.path d="M16 12h6" variants={draw} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function RefreshIcon({ size, ...props }: OperationsIconProps) {
  const { controls } = useAnimateIconContext();
  return (
    <motion.svg
      data-animate-ui-icon="refresh"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      variants={rotate}
      initial="initial"
      animate={controls}
      {...props}
    >
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.4 9A7 7 0 0 0 6.2 6.2L4 8" />
      <path d="m20 16-2.2 1.8A7 7 0 0 1 5.6 15" />
    </motion.svg>
  );
}

function MoreIcon({ size, ...props }: OperationsIconProps) {
  const { controls } = useAnimateIconContext();
  return (
    <motion.svg data-animate-ui-icon="more" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {[5, 12, 19].map((cx, index) => (
        <motion.circle key={cx} cx={cx} cy="12" r="1" variants={pulse} initial="initial" animate={controls} transition={{ delay: index * 0.06 }} />
      ))}
    </motion.svg>
  );
}

function Filter(props: OperationsIconProps) {
  return <IconWrapper icon={FilterIcon} {...props} />;
}
function ShieldCheck(props: OperationsIconProps) {
  return <IconWrapper icon={ShieldIcon} {...props} />;
}
function History(props: OperationsIconProps) {
  return <IconWrapper icon={HistoryIcon} {...props} />;
}
function GitCommit(props: OperationsIconProps) {
  return <IconWrapper icon={GitCommitIcon} {...props} />;
}
function Refresh(props: OperationsIconProps) {
  return <IconWrapper icon={RefreshIcon} {...props} />;
}
function More(props: OperationsIconProps) {
  return <IconWrapper icon={MoreIcon} {...props} />;
}

export { Filter, GitCommit, History, More, Refresh, ShieldCheck, type OperationsIconProps };
