'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import IOSSpinner from '@/components/ui/Spinner';
import { springPop, springSnappy } from '@/lib/motion';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/admin');
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen-safe items-center justify-center bg-bg p-4">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springPop}
        className="w-full max-w-sm rounded-[var(--r-xl)] bg-surface px-6 py-8 shadow-sm"
      >
        <div className="mb-7 text-center">
          <h1 className="text-ios-title1 text-label">LOTG Coffee</h1>
          <p className="text-ios-subhead mt-1 text-label-secondary">Admin Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="admin@lotgchurch.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <AnimatePresence>
            {error && (
              <motion.div
                // A wrong password shakes the panel, the way the iOS lock
                // screen does. It's read before the message is, which is the
                // point — you know to retype before you've finished reading.
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto', x: [0, -8, 8, -5, 5, 0] }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ ...springSnappy, x: { duration: 0.4 } }}
                className="overflow-hidden"
              >
                <p className="text-ios-subhead rounded-[var(--r-md)] bg-danger/12 px-4 py-3 text-danger">
                  {error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading && <IOSSpinner size={18} className="text-white" />}
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
