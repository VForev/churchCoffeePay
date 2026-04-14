'use client';

import { cn } from '@/lib/utils';
import type { OrderStatus, PaymentStatus } from '@/types';

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-amber-700',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-gray-100 text-text-light',
};

export default function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-accent font-semibold',
        variantStyles[variant],
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
