import * as React from 'react';
import {
  motion,
  type HTMLMotionProps,
  type TargetAndTransition,
  type Transition,
  type Variants,
} from 'motion/react';

import {
  useIsInView,
  type UseIsInViewOptions,
} from './use-is-in-view';

type DefaultSplittingTextProps = Omit<
  HTMLMotionProps<'div'>,
  'children' | 'initial' | 'animate' | 'transition'
> & {
  initial?: TargetAndTransition;
  animate?: TargetAndTransition;
  transition?: Transition;
  stagger?: number;
  delay?: number;
  disableAnimation?: boolean;
} & UseIsInViewOptions;

type CharsOrWordsSplittingTextProps = DefaultSplittingTextProps & {
  type?: 'chars' | 'words';
  text: string;
};

type LinesSplittingTextProps = DefaultSplittingTextProps & {
  type: 'lines';
  text: string[];
};

export type SplittingTextProps =
  | CharsOrWordsSplittingTextProps
  | LinesSplittingTextProps;

/**
 * Animate UI's pinned Splitting Text primitive, adapted only to use Rinspace's
 * owned `useIsInView` boundary.
 */
export function SplittingText({
  ref,
  text,
  type = 'chars',
  initial = { x: 150, opacity: 0 },
  animate = { x: 0, opacity: 1 },
  transition = { duration: 0.7, ease: 'easeOut' },
  stagger,
  delay = 0,
  inView = false,
  inViewMargin = '0px',
  inViewOnce = true,
  disableAnimation = false,
  ...props
}: SplittingTextProps) {
  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        delayChildren: delay / 1000,
        staggerChildren:
          stagger ?? (type === 'chars' ? 0.05 : type === 'words' ? 0.2 : 0.3),
      },
    },
  };
  const itemVariants: Variants = {
    hidden: disableAnimation ? animate : initial,
    visible: {
      ...animate,
      transition: disableAnimation ? { duration: 0 } : transition,
    },
  };
  const { ref: localRef, isInView } = useIsInView(
    ref as React.Ref<HTMLElement>,
    { inView, inViewOnce, inViewMargin },
  );

  if (Array.isArray(text)) {
    return (
      <motion.span
        ref={localRef}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        variants={containerVariants}
        {...props}
      >
        {text.map((line, index) => (
          <React.Fragment key={`line-${index}`}>
            <motion.span variants={itemVariants} style={{ display: 'inline-block' }}>
              {line}
            </motion.span>
            {index < text.length - 1 ? <br /> : null}
          </React.Fragment>
        ))}
      </motion.span>
    );
  }

  if (type === 'words') {
    const tokens = text.match(/\S+\s*/g) || [];
    return (
      <motion.span
        ref={localRef}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        variants={containerVariants}
        {...props}
      >
        {tokens.map((token, index) => (
          <React.Fragment key={`${token}-${index}`}>
            <motion.span
              variants={itemVariants}
              style={{ display: 'inline-block', whiteSpace: 'normal' }}
            >
              {token.trim()}
            </motion.span>
            {/\s$/.test(token) ? ' ' : null}
          </React.Fragment>
        ))}
      </motion.span>
    );
  }

  const tokens = text.split(/(\s+)/);
  const perCharacter = stagger ?? 0.05;
  const baseDelaySeconds = delay / 1000;
  let globalIndex = 0;

  return (
    <motion.span
      ref={localRef}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={{ hidden: {}, visible: { transition: {} } }}
      {...props}
    >
      {tokens.map((token, wordIndex) => {
        if (/^\s+$/.test(token)) {
          return <span key={`space-${wordIndex}`}>{token}</span>;
        }
        const characters = Array.from(token);
        const wordDelay = baseDelaySeconds + perCharacter * globalIndex;
        globalIndex += characters.length;
        return (
          <motion.span
            key={`word-${wordIndex}`}
            style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
            variants={{}}
            transition={{ delayChildren: wordDelay, staggerChildren: perCharacter }}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
          >
            {characters.map((character, characterIndex) => (
              <motion.span
                key={`character-${wordIndex}-${characterIndex}`}
                variants={itemVariants}
                style={{ display: 'inline-block', whiteSpace: 'pre' }}
              >
                {character}
              </motion.span>
            ))}
          </motion.span>
        );
      })}
    </motion.span>
  );
}
