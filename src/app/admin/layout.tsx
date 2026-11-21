'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}

/** Grouped by the job someone came here to do, rather than one long list of twelve. */
const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: '📊', exact: true },
      { href: '/admin/orders', label: 'Orders', icon: '📋' },
    ],
  },
  {
    title: 'Menu',
    items: [
      { href: '/admin/menu', label: 'Menu', icon: '☕' },
      { href: '/admin/modifiers', label: 'Modifiers', icon: '⚙️' },
      { href: '/admin/specialty', label: 'Drink of the Day', icon: '🍁' },
      { href: '/admin/inventory', label: 'Inventory', icon: '📦' },
    ],
  },
  {
    title: 'Ordering',
    items: [
      { href: '/admin/settings', label: 'Hours & Settings', icon: '🕒' },
      { href: '/admin/events', label: 'Events', icon: '📅' },
      { href: '/admin/coupons', label: 'Codes', icon: '🎟️' },
    ],
  },
  {
    title: 'Shop setup',
    items: [
      { href: '/admin/labels', label: 'Cup Labels', icon: '🏷️' },
      { href: '/admin/print-setup', label: 'Printer Setup', icon: '🖨️' },
      { href: '/admin/theme', label: 'Look & Colours', icon: '🎨' },
    ],
  },
];

const navItems = navSections.flatMap((s) => s.items);

const quickLinks = [
  { href: '/barista', label: 'Barista View', icon: '🧑‍🍳' },
  { href: '/live', label: 'Live Screen', icon: '📺' },
  { href: '/tablet', label: 'Tablet Order', icon: '📱' },
  { href: '/', label: 'Customer Menu', icon: '🛍️' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        setAuthed(true);
      } else {
        setAuthed(false);
        if (pathname !== '/admin/login') router.push('/admin/login');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // A session that ends in another tab (or expires) sends this one to the login page
  // instead of leaving every save on the page to fail one by one.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setAuthed(false);
        router.push('/admin/login');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
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

  const current = navItems.find((n) => isActive(n.href, n.exact));

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-100 bg-surface lg:static',
          'transform transition-transform duration-300 lg:transform-none',
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Sidebar header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-xl text-white shadow-sm shadow-primary/30">
              ☕
            </span>
            <div>
              <h1 className="font-heading text-lg font-bold leading-tight text-primary">LOTG Coffee</h1>
              <p className="font-accent text-xs text-text-light">Admin</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-light hover:bg-gray-100 lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navSections.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="mb-1 px-3 font-accent text-[11px] font-semibold uppercase tracking-wider text-text-light">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href, item.exact);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      // Closes the drawer on a phone as the page changes — done on the tap
                      // itself rather than by watching the URL afterwards.
                      onClick={() => setSidebarOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-body text-sm transition-colors',
                        active
                          ? 'bg-primary/10 font-semibold text-primary'
                          : 'text-text hover:bg-gray-50 hover:text-text-dark',
                      )}
                    >
                      {active && (
                        <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" />
                      )}
                      <span className="w-5 text-center">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mb-1 px-3 pt-1">
            <p className="font-accent text-[11px] font-semibold uppercase tracking-wider text-text-light">
              Open in a new tab
            </p>
          </div>
          {quickLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl px-3 py-2 font-body text-sm text-text-light transition-colors hover:bg-gray-50 hover:text-text"
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
              <span className="ml-auto text-xs opacity-50">↗</span>
            </a>
          ))}
        </nav>

        {/* Sign out */}
        <div className="shrink-0 border-t border-gray-100 p-3">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/admin/login');
            }}
            className="w-full cursor-pointer rounded-xl px-3 py-2.5 text-left font-body text-sm text-danger transition-colors hover:bg-danger/5"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-gray-100 bg-surface px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 cursor-pointer touch-manipulation items-center justify-center rounded-xl text-text-dark hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="flex-1 font-heading font-bold text-primary">
            {current ? `${current.icon} ${current.label}` : 'Admin'}
          </h1>
        </div>

        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
