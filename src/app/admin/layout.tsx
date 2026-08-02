'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
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
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
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

  return (
    <div className="h-screen overflow-hidden bg-bg flex">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-surface border-r border-gray-100',
          'transform transition-transform duration-300 flex flex-col',
          'lg:transform-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Sidebar header */}
        <div className="p-5 border-b border-gray-100 shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-heading font-bold text-primary">LOTG Coffee</h1>
            <p className="text-xs text-text-light mt-0.5">Admin Panel</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-text-light cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-body transition-colors',
                isActive(item.href, item.exact)
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-text hover:bg-gray-50',
              )}
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {/* Quick links divider */}
          <div className="pt-3 pb-1 px-2">
            <p className="text-xs font-accent text-text-light uppercase tracking-wide">Quick Access</p>
          </div>
          {quickLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-body text-text-light hover:bg-gray-50 transition-colors"
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
              <span className="ml-auto text-xs opacity-50">↗</span>
            </a>
          ))}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-gray-100 shrink-0">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/admin/login');
            }}
            className="w-full px-4 py-3 text-sm text-danger hover:bg-danger/5 rounded-xl transition-colors cursor-pointer text-left font-body"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="lg:hidden bg-surface border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-text-dark cursor-pointer touch-manipulation"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="font-heading font-bold text-primary flex-1">
            {navItems.find((n) => isActive(n.href, n.exact))?.label ?? 'Admin'}
          </h1>
        </div>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
