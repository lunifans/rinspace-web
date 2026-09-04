import { Slot } from '@radix-ui/react-slot';
import { motion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import {
  AnimateSheet,
  AnimateSheetContent,
  AnimateSheetDescription,
  AnimateSheetOverlay,
  AnimateSheetPortal,
  AnimateSheetTitle,
} from './overlay';
import { AnimateButton } from './button';
import { PanelLeft } from './icons/panel-left';

type SidebarContextValue = {
  collapsed: boolean;
  isMobile: boolean;
  layoutId: string;
  mobileOpen: boolean;
  navigationName: string;
  setMobileOpen(open: boolean): void;
  toggle(): void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebarContext() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('AnimateSidebar components must be used inside AnimateSidebarProvider.');
  return context;
}

type AnimateSidebarProviderProps = HTMLAttributes<HTMLDivElement> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  storageKey?: string;
  navigationName?: string;
};

export function AnimateSidebarProvider({
  children,
  className = '',
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  storageKey = 'rinspace-creator-sidebar-open',
  navigationName = '创作',
  ...props
}: AnimateSidebarProviderProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen;
    const stored = window.localStorage.getItem(storageKey);
    return stored === null ? defaultOpen : stored === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 840px)').matches
  ));
  const layoutId = useId();
  const open = controlledOpen ?? uncontrolledOpen;

  const setOpen = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    window.localStorage.setItem(storageKey, String(next));
    onOpenChange?.(next);
  }, [controlledOpen, onOpenChange, storageKey]);

  const toggle = useCallback(() => {
    if (isMobile) setMobileOpen((current) => !current);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 840px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'b' || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  const value = useMemo<SidebarContextValue>(() => ({
    collapsed: !open,
    isMobile,
    layoutId,
    mobileOpen,
    navigationName,
    setMobileOpen,
    toggle,
  }), [isMobile, layoutId, mobileOpen, navigationName, open, toggle]);

  return (
    <SidebarContext.Provider value={value}>
      <div
        className={`rin-animate-sidebar-provider ${className}`.trim()}
        data-sidebar-state={open ? 'expanded' : 'collapsed'}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

type AnimateSidebarProps = HTMLAttributes<HTMLElement> & {
  label?: string;
};

export function AnimateSidebar({ children, className = '', label = '工作区导航', ...props }: AnimateSidebarProps) {
  const { isMobile, mobileOpen, navigationName, setMobileOpen } = useSidebarContext();
  const content = (
    <aside className={`rin-animate-sidebar ${className}`.trim()} aria-label={label} {...props}>
      <div className="rin-animate-sidebar__inner">{children}</div>
    </aside>
  );

  if (!isMobile) return content;
  return (
    <AnimateSheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <AnimateSheetPortal>
        <AnimateSheetOverlay className="rin-ui-overlay" />
        <AnimateSheetContent side="left" className="rin-animate-sidebar-sheet" data-rin-ui="v2">
          <AnimateSheetTitle className="rin-visually-hidden">{label}</AnimateSheetTitle>
          <AnimateSheetDescription className="rin-visually-hidden">{navigationName}导航</AnimateSheetDescription>
          {content}
        </AnimateSheetContent>
      </AnimateSheetPortal>
    </AnimateSheet>
  );
}

export function AnimateSidebarTrigger({ className = '', onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { collapsed, isMobile, navigationName, toggle } = useSidebarContext();
  const label = isMobile ? `打开${navigationName}导航` : collapsed ? `展开${navigationName}导航` : `收起${navigationName}导航`;
  return (
    <AnimateButton
      unstyled
      className={`rin-animate-sidebar-trigger ${className}`.trim()}
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggle();
      }}
      {...props}
    >
      <PanelLeft animateOnHover size={18} aria-hidden="true" />
    </AnimateButton>
  );
}

export function AnimateSidebarHeader({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rin-animate-sidebar-header ${className}`.trim()} {...props} />;
}

export function AnimateSidebarContent({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rin-animate-sidebar-content ${className}`.trim()} {...props} />;
}

export function AnimateSidebarFooter({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rin-animate-sidebar-footer ${className}`.trim()} {...props} />;
}

export function AnimateSidebarInset({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={`rin-animate-sidebar-inset ${className}`.trim()} {...props} />;
}

export function AnimateSidebarMenu({ className = '', ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={`rin-animate-sidebar-menu ${className}`.trim()} {...props} />;
}

export function AnimateSidebarMenuItem({ className = '', ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={`rin-animate-sidebar-menu-item ${className}`.trim()} {...props} />;
}

type AnimateSidebarMenuButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  asChild?: boolean;
  children: ReactNode;
  isActive?: boolean;
  tooltip?: string;
};

export function AnimateSidebarMenuButton({
  asChild = false,
  children,
  className = '',
  isActive = false,
  tooltip,
  onClick,
  ...props
}: AnimateSidebarMenuButtonProps) {
  const { collapsed, isMobile, layoutId, setMobileOpen } = useSidebarContext();
  const buttonClassName = `rin-animate-sidebar-menu-button ${className}`.trim();
  const title = collapsed && !isMobile ? tooltip : undefined;
  const frame = (control: ReactNode) => (
    <div className="rin-animate-sidebar-menu-button-frame">
      {isActive ? (
        <motion.span
          aria-hidden="true"
          className="rin-animate-sidebar-menu-highlight"
          layoutId={`${layoutId}-active-item`}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        />
      ) : null}
      {control}
    </div>
  );

  if (asChild) {
    return frame(
      <Slot
        className={buttonClassName}
        data-active={isActive || undefined}
        aria-current={isActive ? 'page' : undefined}
        title={title}
        onClick={() => {
          if (isMobile) setMobileOpen(false);
        }}
        {...props}
      >
        {children}
      </Slot>,
    );
  }

  return frame(
    <button
      className={buttonClassName}
      data-active={isActive || undefined}
      aria-current={isActive ? 'page' : undefined}
      title={title}
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && isMobile) setMobileOpen(false);
      }}
      {...props}
    >
      {children}
    </button>,
  );
}

export function AnimateSidebarMenuBadge({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`rin-animate-sidebar-menu-badge ${className}`.trim()} {...props} />;
}

export function useAnimateSidebar() {
  return useSidebarContext();
}
