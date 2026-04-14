'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { MenuItem } from '@/types';

interface MenuCardProps {
  item: MenuItem;
  eventFree?: boolean;
  effectivePrice?: number;
  onClick: () => void;
}

export default function MenuCard({ item, eventFree, effectivePrice, onClick }: MenuCardProps) {
  const price = effectivePrice ?? item.base_price;
  const isFree = eventFree || item.is_free || price === 0;

  return (
    <Card hover onClick={onClick} className="flex flex-col justify-between h-full">
      {item.image_url && (
        <div className="w-full h-32 rounded-xl bg-bg mb-3 overflow-hidden">
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1">
        <h3 className="font-heading font-bold text-text-dark text-base leading-tight">
          {item.name}
        </h3>
        {item.description && (
          <p className="text-sm text-text-light mt-1 line-clamp-2">{item.description}</p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Badge variant="success">Free</Badge>
        {!item.is_available && (
          <Badge variant="neutral">Unavailable</Badge>
        )}
      </div>
    </Card>
  );
}
