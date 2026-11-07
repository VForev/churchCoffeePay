'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input, { TextArea } from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { describeCode } from '@/lib/codes';
import { codesMigrated } from '@/lib/access-code';
import type { Category, CodeUse, Coupon, DiscountType } from '@/types';

/**
 * Codes — coupons, access codes and priority codes are one thing now (supabase-codes.sql).
 * A code can open ordering while the shop is closed, put the order at the front of the
 * line, take money off, or any mix of the three. Underneath the list, every use of every
 * code, searchable by code or by name.
 */

/** The editor's discount choice. "none" is stored as 0% off — the table has no such type. */
type DiscountChoice = DiscountType | 'none';

function discountChoice(code: Partial<Coupon>): DiscountChoice {
  if (code.discount_type === 'free_item') return 'free_item';
  return code.discount_value && code.discount_value > 0 ? (code.discount_type ?? 'percentage') : 'none';
}

const NEW_CODE: Partial<Coupon> = {
  code: '',
  label: '',
  discount_type: 'percentage',
  discount_value: 0,
  is_active: true,
  is_priority: false,
  unlocks_ordering: false,
  allow_custom_order: false,
};

/** Characters that mean something inside a PostgREST `or=(...)` filter. */
function cleanSearch(raw: string): string {
  return raw.replace(/[,()*%\\]/g, ' ').trim();
}

function formatUsedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminCodesPage() {
  const [codes, setCodes] = useState<Coupon[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [migrated, setMigrated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editCode, setEditCode] = useState<Partial<Coupon> | null>(null);
  const [discount, setDiscount] = useState<DiscountChoice>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [uses, setUses] = useState<CodeUse[]>([]);
  const [usesLoading, setUsesLoading] = useState(true);
  const [usesError, setUsesError] = useState('');

  const categoryName = (id: string | null | undefined) =>
    categories.find((c) => c.id === id)?.name ?? null;

  async function fetchData() {
    const [codesRes, catsRes, isMigrated] = await Promise.all([
      supabase.from('coupons').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('display_order'),
      codesMigrated(),
    ]);
    if (codesRes.data) setCodes(codesRes.data as Coupon[]);
    if (catsRes.data) setCategories(catsRes.data as Category[]);
    setMigrated(isMigrated);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  // The usage search, debounced so typing a name doesn't fire a query per letter.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setUsesLoading(true);
      let query = supabase
        .from('code_uses')
        .select('*')
        .order('used_at', { ascending: false })
        .limit(300);
      const q = cleanSearch(search);
      if (q) query = query.or(`code.ilike.%${q}%,customer_name.ilike.%${q}%`);
      const { data, error: usesErr } = await query;
      setUsesLoading(false);
      if (usesErr) {
        setUses([]);
        setUsesError(
          /code_uses/.test(usesErr.message ?? '') || usesErr.code === '42P01' || usesErr.code === 'PGRST205'
            ? 'Code uses are recorded once supabase-codes.sql has been run in the Supabase SQL editor.'
            : `Could not load code uses: ${usesErr.message}`,
        );
        return;
      }
      setUsesError('');
      setUses((data ?? []) as CodeUse[]);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  function openEditor(code: Partial<Coupon>) {
    setEditCode(code);
    setDiscount(discountChoice(code));
    setError('');
  }

  async function saveCode() {
    if (!editCode) return;
    const code = editCode.code?.trim().toUpperCase();
    if (!code) return;

    const unlocks = !!editCode.unlocks_ordering;
    const priority = !!editCode.is_priority;
    if (!unlocks && !priority && discount === 'none') {
      setError('Pick at least one thing this code does.');
      return;
    }
    if (!migrated && (unlocks || priority || editCode.label?.trim())) {
      setError(
        'Opening ordering, priority and the "who it’s for" label need supabase-codes.sql. Run it in the Supabase SQL editor, then save again.',
      );
      return;
    }

    const row: Record<string, unknown> = {
      code,
      discount_type: discount === 'none' ? 'percentage' : discount,
      discount_value: discount === 'none' || discount === 'free_item' ? 0 : editCode.discount_value || 0,
      max_uses: editCode.max_uses || null,
      is_active: editCode.id ? editCode.is_active : true,
      expires_at: editCode.expires_at || null,
    };
    if (migrated) {
      Object.assign(row, {
        label: (editCode.label ?? '').trim(),
        is_priority: priority,
        unlocks_ordering: unlocks,
        allowed_category_id: unlocks ? editCode.allowed_category_id || null : null,
        allow_custom_order: unlocks && !!editCode.allow_custom_order,
        custom_order_note:
          unlocks && editCode.allow_custom_order
            ? (editCode.custom_order_note ?? '').trim() || null
            : null,
      });
    }

    setSaving(true);
    setError('');
    const { error: saveError } = editCode.id
      ? await supabase.from('coupons').update(row).eq('id', editCode.id)
      : await supabase.from('coupons').insert(row);
    setSaving(false);

    if (saveError) {
      setError(
        saveError.code === '23505'
          ? 'That code already exists — pick a different one.'
          : `Could not save this code: ${saveError.message}`,
      );
      return;
    }
    setEditCode(null);
    fetchData();
  }

  async function toggleActive(code: Coupon) {
    await supabase.from('coupons').update({ is_active: !code.is_active }).eq('id', code.id);
    fetchData();
  }

  async function deleteCode(id: string) {
    if (!confirm('Delete this code? The record of who used it is kept.')) return;
    const { error: deleteError } = await supabase.from('coupons').delete().eq('id', id);
    if (deleteError) {
      alert(
        deleteError.code === '23503'
          ? 'Could not delete this code because orders that used it still reference it. Run supabase-fix-delete-constraints.sql in the Supabase SQL editor, then try again — or just Disable it.'
          : `Could not delete this code: ${deleteError.message}`,
      );
      return;
    }
    fetchData();
  }

  function showUsesOf(code: string) {
    setSearch(code);
    document.getElementById('code-uses')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // "Who" for whatever is in the search box: each name once, with how often.
  const people = Object.entries(
    uses.reduce<Record<string, number>>((acc, u) => {
      const name = u.customer_name || 'No name';
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-text-dark">Codes</h1>
        <Button size="sm" onClick={() => openEditor(NEW_CODE)}>
          + New Code
        </Button>
      </div>
      <p className="mb-6 max-w-2xl font-body text-sm text-text-light">
        One code can do any mix of three things: <strong>open ordering</strong> while the shop is
        closed, put the order at the <strong>front of the line</strong>, and{' '}
        <strong>take money off</strong>. Customers type it into the code box when they place their
        order. Give each person or group their own code and you&apos;ll see exactly who used it
        below.
      </p>

      {!migrated && (
        <Card className="mb-6 border-2 border-warning/40 bg-warning/10">
          <p className="font-accent text-sm font-bold text-text-dark">
            Run supabase-codes.sql to finish merging codes
          </p>
          <p className="mt-1 font-body text-sm text-text">
            Until it runs, this page only does discounts, codes that open ordering are still on
            the old <Link href="/admin/access-codes" className="font-semibold text-primary underline">Access Codes</Link>{' '}
            page, and nobody&apos;s use of a code is recorded. Running it copies every access code
            in here.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {codes.map((code) => (
          <Card key={code.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading font-bold text-text-dark font-mono">{code.code}</h3>
                  <Badge variant={code.is_active ? 'success' : 'neutral'}>
                    {code.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                  {code.unlocks_ordering && <Badge variant="primary">🔓 Opens ordering</Badge>}
                  {code.is_priority && <Badge variant="warning">⚡ Priority</Badge>}
                </div>
                <p className="mt-1 text-sm text-text-light">
                  {code.label && <span className="font-semibold text-text">{code.label} · </span>}
                  {describeCode(code)}
                  {code.unlocks_ordering && code.allowed_category_id && (
                    <span className="text-warm"> ({categoryName(code.allowed_category_id) ?? 'one category'} only)</span>
                  )}
                  {code.unlocks_ordering && code.allow_custom_order && <span className="text-primary"> · ✍️ write-in</span>}
                  {' · '}Used {code.times_used}{code.max_uses ? `/${code.max_uses}` : ''} times
                  {code.expires_at && ` · Expires ${new Date(code.expires_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button onClick={() => showUsesOf(code.code)} className="text-sm text-primary hover:underline cursor-pointer">Who used it</button>
                <Button size="sm" variant={code.is_active ? 'ghost' : 'success'} onClick={() => toggleActive(code)} className="border border-gray-200">
                  {code.is_active ? 'Disable' : 'Enable'}
                </Button>
                <button onClick={() => openEditor(code)} className="text-sm text-primary hover:underline cursor-pointer">Edit</button>
                <button onClick={() => deleteCode(code.id)} className="text-sm text-danger hover:underline cursor-pointer">Delete</button>
              </div>
            </div>
          </Card>
        ))}
        {codes.length === 0 && (
          <Card className="text-center py-8"><p className="text-text-light">No codes yet</p></Card>
        )}
      </div>

      {/* Who used which code */}
      <section id="code-uses" className="mt-10 scroll-mt-6">
        <h2 className="font-heading text-xl font-bold text-text-dark">Who used which code</h2>
        <p className="mt-1 mb-4 max-w-2xl font-body text-sm text-text-light">
          Every code on every order, newest first. Search a code to see everyone who used it, or a
          name to see every code that person used.
        </p>

        <div className="mb-4 flex gap-2">
          <Input
            placeholder="Search a code or a name — e.g. PASTOR or Sarah"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <Button variant="ghost" onClick={() => setSearch('')} className="shrink-0 border border-gray-200">
              Clear
            </Button>
          )}
        </div>

        {usesError ? (
          <Card className="py-6 text-center"><p className="text-sm text-text-light">{usesError}</p></Card>
        ) : usesLoading && uses.length === 0 ? (
          <Card className="py-6 text-center"><p className="text-sm text-text-light">Loading…</p></Card>
        ) : uses.length === 0 ? (
          <Card className="py-6 text-center">
            <p className="text-sm text-text-light">
              {search ? `Nobody has used a code matching “${search}”.` : 'No codes have been used yet.'}
            </p>
          </Card>
        ) : (
          <>
            <p className="mb-2 font-accent text-sm font-semibold text-text">
              {uses.length}{uses.length === 300 ? '+' : ''} use{uses.length !== 1 ? 's' : ''} · {people.length}{' '}
              {people.length === 1 ? 'person' : 'people'}
            </p>
            {search && people.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {people.slice(0, 20).map(([name, count]) => (
                  <span key={name} className="rounded-full bg-gray-100 px-3 py-1 font-accent text-xs font-semibold text-text-dark">
                    {name}{count > 1 && ` ×${count}`}
                  </span>
                ))}
              </div>
            )}
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 font-accent text-xs uppercase tracking-wider text-text-light">
                  <tr>
                    <th className="px-4 py-2.5">When</th>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">What it did</th>
                    <th className="px-4 py-2.5">Where</th>
                  </tr>
                </thead>
                <tbody>
                  {uses.map((u) => (
                    <tr key={u.id} className="border-b border-gray-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-light">{formatUsedAt(u.used_at)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setSearch(u.code)} className="cursor-pointer font-mono font-bold text-primary hover:underline">
                          {u.code}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-text-dark">
                        <button onClick={() => setSearch(u.customer_name)} className="cursor-pointer hover:underline">
                          {u.customer_name || '—'}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-text">
                        {[
                          u.unlocked && '🔓 Opened ordering',
                          u.priority && '⚡ Priority',
                          Number(u.discount_amount) > 0 && `$${Number(u.discount_amount).toFixed(2)} off`,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Entered'}
                      </td>
                      <td className="px-4 py-2.5 text-text-light">
                        {u.order_source === 'counter' ? 'Counter' : u.order_source === 'mobile' ? 'Phone' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </section>

      <Modal isOpen={!!editCode} onClose={() => setEditCode(null)} title={editCode?.id ? 'Edit Code' : 'New Code'} size="sm">
        {editCode && (
          <div className="space-y-4">
            <Input label="Code" value={editCode.code || ''} onChange={(e) => setEditCode({ ...editCode, code: e.target.value.toUpperCase() })} placeholder="e.g. PASTOR" />
            <Input label="Who it's for (only you see this)" value={editCode.label || ''} onChange={(e) => setEditCode({ ...editCode, label: e.target.value })} placeholder="e.g. Pastor Mike, Worship Team" />

            <p className="font-accent text-sm font-semibold text-text">What this code does — pick any</p>

            {/* Opens ordering */}
            <div className="rounded-xl border border-gray-200 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={!!editCode.unlocks_ordering}
                  onChange={(e) => setEditCode({ ...editCode, unlocks_ordering: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-accent font-semibold text-text-dark">🔓 Opens ordering when we&apos;re closed</span>
                  <span className="block text-sm text-text-light">
                    Lets them order outside ordering hours or while Force Closed. Never gets past Lock Everything.
                  </span>
                </span>
              </label>
              {editCode.unlocks_ordering && (
                <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="mb-1.5 block font-accent text-sm font-semibold text-text">What they can order</label>
                    <select
                      value={editCode.allowed_category_id || ''}
                      onChange={(e) => setEditCode({ ...editCode, allowed_category_id: e.target.value || null })}
                      className="w-full rounded-xl border border-gray-200 bg-surface px-4 py-2.5 font-body"
                    >
                      <option value="">Whole menu</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} only</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!editCode.allow_custom_order}
                      onChange={(e) => setEditCode({ ...editCode, allow_custom_order: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm text-text-dark">Allow write-in custom orders (a free-text box)</span>
                  </label>
                  {editCode.allow_custom_order && (
                    <TextArea
                      label="Fine print shown by the box"
                      rows={2}
                      value={editCode.custom_order_note ?? ''}
                      onChange={(e) => setEditCode({ ...editCode, custom_order_note: e.target.value })}
                      placeholder="We'll do our best — if we can't make it, we won't. Sorry!"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Priority */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3">
              <input
                type="checkbox"
                checked={!!editCode.is_priority}
                onChange={(e) => setEditCode({ ...editCode, is_priority: e.target.checked })}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block font-accent font-semibold text-text-dark">⚡ Priority — front of the line</span>
                <span className="block text-sm text-text-light">
                  For people who need their coffee before they&apos;re on. The order goes ahead of everything not yet started, and the barista sees it marked Priority.
                </span>
              </span>
            </label>

            {/* Discount */}
            <div className="rounded-xl border border-gray-200 p-3">
              <label className="mb-1.5 block font-accent font-semibold text-text-dark">💲 Discount</label>
              <select
                value={discount}
                onChange={(e) => {
                  const next = e.target.value as DiscountChoice;
                  setDiscount(next);
                  setEditCode({ ...editCode, discount_type: next === 'none' ? 'percentage' : next });
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-surface font-body"
              >
                <option value="none">No discount</option>
                <option value="percentage">Percentage off</option>
                <option value="fixed_amount">Fixed amount off</option>
                <option value="free_item">Free order</option>
              </select>
              {(discount === 'percentage' || discount === 'fixed_amount') && (
                <div className="mt-3">
                  <Input
                    label={discount === 'percentage' ? 'Percentage (e.g., 50 for 50%)' : 'Amount ($)'}
                    type="number" step="0.01" min="0"
                    value={editCode.discount_value || 0}
                    onChange={(e) => setEditCode({ ...editCode, discount_value: parseFloat(e.target.value) })}
                  />
                </div>
              )}
            </div>

            <Input label="Max Uses (leave empty for unlimited)" type="number" min="1" value={editCode.max_uses || ''} onChange={(e) => setEditCode({ ...editCode, max_uses: e.target.value ? parseInt(e.target.value) : null })} />
            <Input label="Expiration Date" type="date" value={editCode.expires_at ? editCode.expires_at.split('T')[0] : ''} onChange={(e) => setEditCode({ ...editCode, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditCode(null)}>Cancel</Button>
              <Button onClick={saveCode} disabled={saving || !editCode.code?.trim()}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
