import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type HoverInfoProps = {
  label: ReactNode;
  tooltip: string;
  align?: 'left' | 'center' | 'right';
  placement?: 'top' | 'bottom';
  className?: string;
};

export function HoverInfo({ label, tooltip, align = 'left', placement = 'top', className = '' }: HoverInfoProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    const refresh = () => setTick((value) => value + 1);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, [open]);

  const tooltipStyle = useMemo(() => {
    if (!open || !rootRef.current || typeof window === 'undefined') return null;
    const rect = rootRef.current.getBoundingClientRect();
    const base: CSSProperties = {
      position: 'fixed',
      zIndex: 90,
      minWidth: '14rem',
      maxWidth: '22rem',
      whiteSpace: 'pre-line',
      backgroundColor: 'var(--card)',
      border: '1px solid var(--border)',
      color: 'var(--text)',
      borderRadius: '0.75rem',
      padding: '0.5rem 0.75rem',
      fontSize: '0.75rem',
      lineHeight: '1.25rem',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)',
      pointerEvents: 'none'
    };
    if (placement === 'bottom') base.top = rect.bottom + 8;
    else base.bottom = window.innerHeight - rect.top + 8;
    if (align === 'left') base.left = rect.left;
    else if (align === 'right') {
      base.left = rect.right;
      base.transform = 'translateX(-100%)';
    } else {
      base.left = rect.left + rect.width / 2;
      base.transform = 'translateX(-50%)';
    }
    return base;
  }, [align, open, placement, tick]);

  return <span
    ref={rootRef}
    className={`relative inline-flex items-center gap-1 ${className}`.trim()}
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)}
    onBlur={() => setOpen(false)}
  >
    <span>{label}</span>
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-semibold text-[var(--text-muted)] transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}>
      ?
    </span>
    {open && tooltipStyle && typeof document !== 'undefined' && createPortal(
      <span role="tooltip" style={tooltipStyle}>
        {tooltip}
      </span>,
      document.body
    )}
  </span>;
}
