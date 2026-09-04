import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { AnimateIconButton } from './icon-button';

/** Controlled adaptation of pinned Animate UI Theme Toggler; storage remains app-owned. */
export function AnimateThemeToggler({ resolved, onToggle, label, className = '' }: { resolved: 'light' | 'dark'; onToggle: () => void; label: string; className?: string }) {
  return <AnimateIconButton className={className} icon={<AnimatePresence initial={false} mode="wait"><motion.span key={resolved} initial={{ opacity: 0, rotate: -70, scale: .65 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 70, scale: .65 }}>{resolved === 'light' ? <Moon /> : <Sun />}</motion.span></AnimatePresence>} label={label} onClick={onToggle} />;
}
