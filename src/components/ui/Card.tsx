'use client';

import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  hover?: boolean;
}

export default function Card({ className, onClick, children, hover = false }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface rounded-2xl shadow-sm border border-gray-100 p-4',
        hover && 'hover:shadow-md hover:border-secondary/30 transition-all duration-200 cursor-pointer',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
