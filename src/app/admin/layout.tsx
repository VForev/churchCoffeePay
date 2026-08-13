'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import IOSSpinner from '@/components/ui/Spinner';
import { scrim, springSheet, springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '⊞', exact: true },
  { href: '/admin/menu', label: 'Menu', icon: '☕' },
  { href: '/admin/modifiers', label: 'Modifiers', icon: '⚙' },
  { href: '/admin/events', label: 'Events', icon: '📅' },
  { href: '/admin/coupons', label: 'Coupons', icon: '🎟' },
  { href: '/admin/access-codes', label: 'Access Codes', icon: '🔑' },
  { href: '/admin/inventory', label: 'Inventory', icon: '📦' },
  { href: '/admin/orders', label: 'Orders', icon: '📋' },
  { href: '/admin/labels', label: 'Cup Labels', icon: '🏷' },
  { href: '/admin/print-setup', label: 'Printer Setup', icon: '🖨' },
  { href: '/admin/settings', label: 'Settings', icon: '🕒' },
];

const quickLinks = [
  { href: '/barista', label: 'Barista View', icon: '👨‍🍳' },
  { href: '/live', label: 'Live Screen', icon: '📺' },
  { href: '/tablet', label: 'Tablet Order', icon: '📱' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthed(true);
      } else {
        setAuthed(false);
        if (pathname !== '/admin/login') router.push('/admin/login');
      }
    });
  }, [pathname, router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (authed === null) {
    return (
      <div className="flex min-h-screen-safe items-center justify-center bg-bg">
        <IOSSpinner size={28} />
      </div>
    );
  }

  if (!authed || pathname === '/admin/login') {
    return <>{children}</>;
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const navContent = (
    <>
      {/* Sidebar header */}
      <div className="hairline-b flex shrink-0 items-center justify-between p-5 pt-safe">
        <div>
          <h1 className="text-ios-title3 text-label">LOTG Coffee</h1>
          <p className="text-ios-caption mt-0.5 text-label-secondary">Admin Panel</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          transition={springSnappy}
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-fill-secondary text-label-secondary lg:hidden"
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </motion.button>
      </div>

      {/* Nav */}
      <nav className="scroll-ios flex-1 space-y-0.5 overflow-y-auto p-3">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 rounded-[var(--r-md)] px-4 py-3 text-[15px]',
                active ? 'font-semibold text-primary' : 'text-label hover-row',
              )}
            >
              {/* One selection pill that slides between rows, rather than each
                  row fading its own background — the sidebar equivalent of the
                  segmented control's moving highlight. */}
              {active && (
                <motion.span
                  layoutId="admin-nav-pill"
                  transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                  className="absolute inset-0 rounded-[var(--r-md)] bg-primary/12"
                />
              )}
              <span className="relative z-10 w-5 text-center">{item.icon}</span>
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}

        {/* Quick links divider */}
        <div className="px-2 pb-1 pt-4">
          <p className="text-ios-caption uppercase tracking-wide text-label-secondary">
            Quick Access
          </p>
        </div>
        {quickLinks.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="hover-row flex items-center gap-3 rounded-[var(--r-md)] px-4 py-2.5 text-[15px] text-label-secondary"
          >
            <span className="w-5 text-center">{item.icon}</span>
            {item.label}
            <span className="ml-auto text-[13px] opacity-50">↗</span>
          </a>
        ))}
      </nav>

      {/* Sign out */}
      <div className="hairline-t shrink-0 p-3 pb-safe">
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/admin/login');
          }}
          className="press w-full cursor-pointer rounded-[var(--r-md)] px-4 py-3 text-left text-[15px] text-danger"
        >
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              variants={scrim}
              initial="hidden"
              animate="show"
              exit="exit"
              className="fixed inset-0 z-40 bg-[var(--scrim)] backdrop-blur-[2px] lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={springSheet}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-plain shadow-[var(--shadow-raised)] lg:hidden"
            >
              {navContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Static sidebar on wide screens */}
      <aside className="hairline-b hidden w-64 shrink-0 flex-col border-r border-separator bg-plain lg:flex">
        {navContent}
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="material-bar hairline-b sticky top-0 z-30 flex shrink-0 items-center gap-2 px-3 py-2.5 pt-safe lg:hidden">
          <motion.button
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-primary touch-manipulation"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </motion.button>
          <h1 className="text-ios-headline flex-1 text-label">
            {navItems.find((n) => isActive(n.href, n.exact))?.label ?? 'Admin'}
          </h1>
        </div>

        <main className="scroll-ios flex-1 overflow-auto p-4 pb-safe-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
