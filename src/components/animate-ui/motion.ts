export const rinMotion = {
  immediate: .14,
  structural: .22,
  navigation: .32,
  easeOut: [0.16, 1, 0.3, 1] as const,
  spring: { type: 'spring' as const, stiffness: 420, damping: 34 },
  iconSpring: { type: 'spring' as const, stiffness: 520, damping: 28 },
};

export const rinMotionVariants = {
  feedback: { initial: { opacity: 0, y: 4 }, active: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -2 } },
  feedItem: { initial: { opacity: 0, y: 8 }, active: { opacity: 1, y: 0 } },
  overlay: { initial: { opacity: 0 }, active: { opacity: 1 }, exit: { opacity: 0 } },
} as const;
