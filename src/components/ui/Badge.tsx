'use client';

import { cn } from '@/lib/utils';
import type { OrderStatus, PaymentStatus } from '@/types';

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  /** Solid fill instead of a tint — for the one status that must carry across
   *  a room, like SOLD OUT or a READY card on the barista board. */
  solid?: boolean;
}

/**
 * Tinted by default: accent text on a 15% wash of the same accent. That ratio
 * holds contrast in both appearances, which a fixed pastel background would
 * not — a `bg-green-100` chip becomes unreadable on a black page.
 */
const tintStyles: Record<BadgeVariant, string> = {
  primary: 'bg-primary/15 text-primary',
  secondary: 'bg-secondary/15 text-secondary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  neutral: 'bg-fill-secondary text-label-secondary',
};

const solidStyles: Record<BadgeVariant, string> = {
  primary: 'bg-primary text-white',
  secondary: 'bg-secondary text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
  neutral: 'bg-label-secondary text-plain',
};

export default function Badge({ variant = 'neutral', children, className, solid }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
        'font-accent text-[13px] font-semibold leading-none tracking-[-0.01em]',
        solid ? solidStyles[variant] : tintStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config: Record<OrderStatus, { variant: BadgeVariant; label: string }> = {
    pending: { variant: 'warning', label: 'Pending' },
    in_progress: { variant: 'primary', label: 'Making' },
    ready: { variant: 'success', label: 'Ready' },
    completed: { variant: 'neutral', label: 'Done' },
    cancelled: { variant: 'danger', label: 'Cancelled' },
  };
  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const config: Record<PaymentStatus, { variant: BadgeVariant; label: string }> = {
    unpaid: { variant: 'warning', label: 'Unpaid' },
    paid: { variant: 'success', label: 'Paid' },
    free: { variant: 'secondary', label: 'Free' },
  };
  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}
