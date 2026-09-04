import * as AccordionPrimitive from '@radix-ui/react-accordion';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown, File, Folder } from 'lucide-react';
import { motion } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';

/** Adapted from pinned Animate UI Radix Checkbox. */
export function AnimateCheckbox({ label, ...props }: CheckboxPrimitive.CheckboxProps & { label: ReactNode }) {
  return <label className="rin-ui-check-row"><CheckboxPrimitive.Root {...props} className="rin-ui-checkbox rin-animate-checkbox"><CheckboxPrimitive.Indicator asChild><motion.span initial={{ scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><Check /></motion.span></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root><span>{label}</span></label>;
}

/** Adapted from pinned Animate UI Radix Switch. */
export function AnimateSwitch({ label, ...props }: SwitchPrimitive.SwitchProps & { label: ReactNode }) {
  return <label className="rin-ui-check-row"><SwitchPrimitive.Root {...props} className="rin-ui-switch rin-animate-switch"><SwitchPrimitive.Thumb asChild><motion.span className="rin-ui-switch-thumb" layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} /></SwitchPrimitive.Thumb></SwitchPrimitive.Root><span>{label}</span></label>;
}

export function AnimateProgress({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="rin-animate-progress"><div className="rin-visually-hidden">{label}：{Math.round(percentage)}%</div><motion.span initial={false} animate={{ width: `${percentage}%` }} transition={{ type: 'spring', stiffness: 260, damping: 32 }} /></div>;
}

export const AnimateAccordion = AccordionPrimitive.Root;
export const AnimateAccordionItem = AccordionPrimitive.Item;
export const AnimateAccordionContent = AccordionPrimitive.Content;
export function AnimateAccordionTrigger({ children, className = '', ...props }: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return <AccordionPrimitive.Header><AccordionPrimitive.Trigger {...props} className={`rin-animate-accordion-trigger ${className}`.trim()}>{children}<ChevronDown aria-hidden="true" /></AccordionPrimitive.Trigger></AccordionPrimitive.Header>;
}

export interface AnimateFileNode { id: string; label: string; type: 'file' | 'folder'; children?: AnimateFileNode[] }
export function AnimateFiles({ nodes, activeId, onSelect }: { nodes: AnimateFileNode[]; activeId?: string; onSelect?: (node: AnimateFileNode) => void }) {
  const render = (node: AnimateFileNode, depth: number) => <li key={node.id}><motion.button aria-pressed={node.id === activeId} className="rin-animate-file" onClick={() => onSelect?.(node)} style={{ paddingInlineStart: `${.55 + depth * .9}rem` }} type="button" whileTap={{ scale: .985 }}>{node.type === 'folder' ? <Folder /> : <File />}<span>{node.label}</span></motion.button>{node.children ? <ul>{node.children.map((child) => render(child, depth + 1))}</ul> : null}</li>;
  return <ul className="rin-animate-files">{nodes.map((node) => render(node, 0))}</ul>;
}
