'use client';

import { motion } from 'motion/react';
import Switch from '@/components/ui/Switch';
import { cn } from '@/lib/utils';

/**
 * The inset grouped list — the Settings.app pattern.
 *
 * This is the single most recognisable iOS layout, and it's what most of the
 * admin pages actually are underneath: a titled section of labelled rows with
 * a control on the right. Rows are separated by inset hairlines that stop
 * short of the left edge, and the last row has none, so the group reads as
 * one continuous card rather than a stack of bordered strips.
 */

interface ListGroupProps {
  /** Uppercase header above the group. */
  header?: string;
  /** Explanatory text below the group, as iOS uses for settings caveats. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ListGroup({ header, footer, children, className }: ListGroupProps) {
  return (
    <section className={cn('w-full', className)}>
      {header && <h3 className="list-section-header">{header}</h3>}
      <div className="overflow-hidden rounded-[var(--r-lg)] bg-surface shadow-sm">
        {children}
      </div>
      {footer && (
        <p className="px-4 pt-2 text-ios-footnote text-label-secondary">{footer}</p>
      )}
    </section>
  );
}

/**
 * A labelled switch for use inside a form or modal, where there's no
 * surrounding grouped list to sit in.
 *
 * Text leads, control trails — the iOS convention, and the reason it reads as
 * a setting rather than a checkbox with a caption glued to it.
 */
export function SwitchField({
  label,
  help,
  checked,
  onChange,
  className,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[var(--r-md)] bg-fill-quaternary px-3.5 py-3',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="text-ios-subhead block font-medium text-label">{label}</span>
        {help && <span className="text-ios-caption block text-label-secondary">{help}</span>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

interface ListRowProps {
  /** Primary text. */
  label: React.ReactNode;
  /** Grey text under the label. */
  detail?: React.ReactNode;
  /** Right-hand side: a Switch, a value, a chevron. */
  accessory?: React.ReactNode;
  /** Leading icon or emoji, in an iOS rounded-square tile when `iconBg` set. */
  icon?: React.ReactNode;
  iconBg?: string;
  onClick?: () => void;
  /** Draws the disclosure chevron and makes the row pressable. */
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function ListRow({
  label,
  detail,
  accessory,
  icon,
  iconBg,
  onClick,
  chevron,
  destructive,
  className,
  children,
}: ListRowProps) {
  const interactive = !!onClick;

  return (
    <motion.div
      onClick={onClick}
      whileTap={interactive ? { backgroundColor: 'var(--fill-tertiary)' } : undefined}
      transition={{ duration: 0.1 }}
      className={cn(
        'relative flex items-center gap-3 px-4 py-3 min-h-[44px]',
        // Inset hairline via a pseudo-element on every row but the last —
        // `last:before:hidden` is why the group's bottom edge stays clean.
        'before:absolute before:bottom-0 before:right-0 before:h-px before:bg-separator',
        icon ? 'before:left-[60px]' : 'before:left-4',
        'last:before:hidden',
        interactive && 'cursor-pointer',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[7px] text-[15px]',
            iconBg ?? 'bg-fill-secondary',
          )}
        >
          {icon}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-ios-body truncate',
            destructive ? 'text-danger' : 'text-label',
          )}
        >
          {label}
        </div>
        {detail && (
          <div className="text-ios-footnote mt-0.5 text-label-secondary">{detail}</div>
        )}
        {children}
      </div>

      <div className="flex shrink-0 items-center gap-2 text-label-secondary">
        {accessory}
        {chevron && (
          // SF Symbols chevron.right, at the weight iOS actually uses.
          <svg viewBox="0 0 12 20" className="h-[13px] w-[8px] text-label-tertiary" fill="none">
            <path
              d="M2 2l8 8-8 8"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </motion.div>
  );
}
