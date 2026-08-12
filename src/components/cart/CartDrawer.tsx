'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useCart } from '@/lib/hooks';
import { cartStore } from '@/lib/cart-store';
import Button from '@/components/ui/Button';
import Stepper from '@/components/ui/Stepper';
import {
  drawerRight,
  scrim,
  sheetUp,
  shouldDismiss,
  springLayout,
  springSheet,
} from '@/lib/motion';
import { cn } from '@/lib/utils';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** When false, the shop isn't taking orders and the order can't be submitted. */
  orderingOpen?: boolean;
  onCheckout: () => void;
}

/**
 * Presents as a bottom sheet on a phone and a right-hand drawer on a tablet
 * or desktop. That split matches where the cart is actually used: a customer's
 * phone, where sheets are the native idiom, and the counter tablet, where the
 * menu needs to stay visible beside it.
 */
export default function CartDrawer({
  isOpen,
  onClose,
  orderingOpen = true,
  onCheckout,
}: CartDrawerProps) {
  const cart = useCart();
  const dragControls = useDragControls();
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
          <motion.div
            variants={scrim}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
          />

          <motion.div
            variants={isWide ? drawerRight : sheetUp}
            initial="hidden"
            animate="show"
            exit="exit"
            drag={isWide ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (shouldDismiss(info.offset.y, info.velocity.y)) onClose();
            }}
            transition={springSheet}
            className={cn(
              'relative flex w-full flex-col bg-plain shadow-[var(--shadow-sheet)]',
              'max-h-[92vh] rounded-t-[var(--r-sheet)]',
              'sm:h-full sm:max-h-none sm:w-[400px] sm:rounded-none',
            )}
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="shrink-0 cursor-grab touch-none pt-2.5 pb-1 active:cursor-grabbing sm:hidden"
            >
              <div className="mx-auto h-[5px] w-9 rounded-full bg-label-quaternary" />
            </div>

            <div className="hairline-b flex shrink-0 items-center justify-between px-5 pb-3 pt-3 sm:pt-5">
              <h2 className="text-ios-title3 text-label">Your Order</h2>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                aria-label="Close"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-fill-secondary text-label-secondary"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </motion.button>
            </div>

            <div className="scroll-ios flex-1 overflow-y-auto px-4 py-4">
              {cart.items.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="mb-3 text-5xl">&#9749;</p>
                  <p className="text-ios-body text-label">Your order is empty</p>
                  <p className="text-ios-subhead mt-1 text-label-secondary">
                    Add some drinks to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* `layout` on each row plus AnimatePresence means removing a
                      drink collapses its row and slides the rest up, instead of
                      the list snapping to a new arrangement. */}
                  <AnimatePresence initial={false} mode="popLayout">
                    {cart.items.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        transition={springLayout}
                        className="rounded-[var(--r-lg)] bg-surface p-3.5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h4 className="text-ios-callout font-semibold text-label">
                              {item.menu_item.name}
                            </h4>
                            {item.selected_modifiers.length > 0 && (
                              <p className="text-ios-footnote mt-0.5 text-label-secondary">
                                {item.selected_modifiers.map((m) => m.name).join(' · ')}
                              </p>
                            )}
                            {item.special_instructions && (
                              <p className="text-ios-footnote mt-0.5 italic text-warm">
                                &ldquo;{item.special_instructions}&rdquo;
                              </p>
                            )}
                          </div>
                          <span className="tnum text-ios-callout shrink-0 font-semibold text-label">
                            {item.item_total === 0 ? 'Free' : `$${item.item_total.toFixed(2)}`}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <Stepper
                            value={item.quantity}
                            min={1}
                            onChange={(q) => cartStore.updateQuantity(item.id, q)}
                          />
                          <button
                            onClick={() => cartStore.removeItem(item.id)}
                            className="press cursor-pointer px-2 text-[15px] text-danger"
                          >
                            Remove
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {cart.items.length > 0 && (
              <motion.div layout className="hairline-t shrink-0 px-5 pb-safe-4 pt-4">
                <div className="space-y-2">
                  <div className="text-ios-subhead flex justify-between text-label-secondary">
                    <span>Subtotal</span>
                    <span className="tnum">${cart.subtotal.toFixed(2)}</span>
                  </div>
                  {cart.discount_amount > 0 && (
                    <div className="text-ios-subhead flex justify-between text-success">
                      <span>Discount</span>
                      <span className="tnum">-${cart.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="hairline-t text-ios-headline flex justify-between pt-2.5 text-label">
                    <span>Total</span>
                    <span className="tnum">${cart.total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-4">
                  {orderingOpen ? (
                    <Button fullWidth size="lg" onClick={onCheckout}>
                      Place Your Coffee Order
                    </Button>
                  ) : (
                    <>
                      <Button fullWidth size="lg" disabled>
                        Ordering Is Closed
                      </Button>
                      <p className="text-ios-footnote mt-2 text-center text-label-secondary">
                        Your drinks are saved — come back when we open.
                      </p>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
