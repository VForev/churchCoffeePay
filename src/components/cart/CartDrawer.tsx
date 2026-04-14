'use client';

import { useCart } from '@/lib/hooks';
import { cartStore } from '@/lib/cart-store';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export default function CartDrawer({ isOpen, onClose, onCheckout }: CartDrawerProps) {
  const cart = useCart();

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-full sm:w-96 bg-surface z-50 shadow-xl',
          'transform transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="text-xl font-heading font-bold">Your Order</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-text-light cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-5">
            {cart.items.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">&#9749;</p>
                <p className="text-text-light font-body">Your order is empty</p>
                <p className="text-sm text-text-light mt-1">Add some drinks to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.items.map((item) => (
                  <div key={item.id} className="bg-bg rounded-xl p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-heading font-bold text-text-dark text-sm">
                          {item.menu_item.name}
                        </h4>
                        {item.selected_modifiers.length > 0 && (
                          <p className="text-xs text-text-light mt-0.5">
                            {item.selected_modifiers.map((m) => m.name).join(', ')}
                          </p>
                        )}
                        {item.special_instructions && (
                          <p className="text-xs text-warm mt-0.5 italic">
                            &ldquo;{item.special_instructions}&rdquo;
                          </p>
                        )}
                      </div>
                      <span className="font-accent font-bold text-sm ml-2 text-success">
                        Free
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => cartStore.updateQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-7 rounded-full bg-surface border border-gray-200 flex items-center justify-center text-sm font-bold hover:bg-gray-50 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-sm font-accent font-semibold w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => cartStore.updateQuantity(item.id, item.quantity + 1)}
                          className="w-7 h-7 rounded-full bg-surface border border-gray-200 flex items-center justify-center text-sm font-bold hover:bg-gray-50 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => cartStore.removeItem(item.id)}
                        className="text-xs text-danger hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {cart.items.length > 0 && (
            <div className="border-t border-gray-100 p-5">
              <Button fullWidth size="lg" onClick={onCheckout}>
                Review Order
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
