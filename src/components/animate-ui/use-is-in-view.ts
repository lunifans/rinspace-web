import { useRef, useImperativeHandle, type Ref } from 'react';
import { useInView, type UseInViewOptions } from 'motion/react';

/**
 * Adapted from the pinned Animate UI hook `hooks/use-is-in-view`.
 * Returns a ref plus an in-view boolean that respects `inView`/`inViewOnce`/margin.
 */
export interface UseIsInViewOptions {
  inView?: boolean;
  inViewOnce?: boolean;
  inViewMargin?: UseInViewOptions['margin'];
}

export function useIsInView<T extends HTMLElement = HTMLElement>(
  ref: Ref<T>,
  options: UseIsInViewOptions = {},
) {
  const { inView, inViewOnce = false, inViewMargin = '0px' } = options;
  const localRef = useRef<T>(null);
  useImperativeHandle(ref, () => localRef.current as T);
  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin,
  });
  const isInView = !inView || inViewResult;
  return { ref: localRef, isInView };
}
