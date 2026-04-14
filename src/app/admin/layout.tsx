'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '&#9776;' },
  { href: '/admin/menu', label: 'Menu', icon: '&#9749;' },
  { href: '/admin/modifiers', label: 'Modifiers', icon: '&#9881;' },
  { href: '/admin/events', label: 'Events', icon: '&#128197;' },
  { href: '/admin/coupons', label: 'Coupons', icon: '&#127915;' },
  { href: '/admin/inventory', label: 'Inventory', icon: '&#128230;' },
  { href: '/admin/orders', label: 'Orders', icon: '&#128203;' },
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

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-surface border-r border-gray-100 transform transition-transform duration-300',
          'lg:transform-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="p-5 border-b border-gray-100">
          <h1 className="text-xl font-heading font-bold text-primary">LOTG Coffee</h1>
          <p className="text-xs text-text-light mt-0.5">Admin Panel</p>
        </div>
        <nav className="p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-colors',
                pathname === item.href
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-text hover:bg-gray-50',
              )}
            >
              <span dangerouslySetInnerHTML={{ __html: item.icon }} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-100">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/admin/login');
            }}
            className="w-full px-3 py-2 text-sm text-danger hover:bg-danger/5 rounded-xl transition-colors cursor-pointer text-left"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden bg-surface border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-dark cursor-pointer"
          >
            &#9776;
          </button>
          <h1 className="font-heading font-bold text-primary">Admin</h1>
        </div>
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
