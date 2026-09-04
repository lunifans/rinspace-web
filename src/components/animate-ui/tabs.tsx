import { createContext, useContext, useId, useMemo, useState, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent } from 'react';
import { LayoutGroup, motion } from 'motion/react';

type TabsState = {
  active: string;
  layoutId: string;
  setActive: (value: string) => void;
};
const TabsContext = createContext<TabsState | null>(null);

type AnimateTabsProps = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> & {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
};

/** Rinspace adaptation of pinned Animate UI Tabs with a shared-layout highlight. */
export function AnimateTabs({ defaultValue = '', onValueChange, value, ...props }: AnimateTabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const active = value === undefined ? internal : value;
  const layoutId = useId();
  const context = useMemo(
    () => ({
      active,
      layoutId,
      setActive: (next: string) => {
        if (value === undefined) setInternal(next);
        onValueChange?.(next);
      },
    }),
    [active, layoutId, onValueChange, value],
  );
  return (
    <TabsContext.Provider value={context}>
      <LayoutGroup id={layoutId}>
        <div {...props} />
      </LayoutGroup>
    </TabsContext.Provider>
  );
}

export function AnimateTabsList({ className = '', onKeyDown, ...props }: HTMLAttributes<HTMLDivElement>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0 || !tabs.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
  };
  return <div role="tablist" className={`rin-animate-tabs ${className}`.trim()} onKeyDown={handleKeyDown} {...props} />;
}

type AnimateTabsTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> & { value: string };
export function AnimateTabsTrigger({ children, className = '', value, onClick, ...props }: AnimateTabsTriggerProps) {
  const context = useContext(TabsContext);
  const selected = context?.active === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={`rin-animate-tab ${className}`.trim()}
      data-state={selected ? 'active' : 'inactive'}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context?.setActive(value);
      }}
      {...props}
    >
      {selected ? <motion.span className="rin-animate-tab__highlight" layoutId={`${context.layoutId}-highlight`} transition={{ type: 'spring', stiffness: 420, damping: 34 }} /> : null}
      <span className="rin-animate-tab__label">{children}</span>
    </button>
  );
}

type AnimateTabsContentProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
};
export function AnimateTabsContent({ className = '', value, ...props }: AnimateTabsContentProps) {
  const context = useContext(TabsContext);
  return <div role="tabpanel" hidden={context?.active !== value} className={`rin-animate-tab-content ${className}`.trim()} {...props} />;
}
