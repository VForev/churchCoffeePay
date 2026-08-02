'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import type { AccessCode } from '@/types';

export default function AdminAccessCodesPage() {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCode, setEditCode] = useState<Partial<AccessCode> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function fetchData() {
    const { data } = await supabase
      .from('access_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setCodes(data as AccessCode[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function saveCode() {
    if (!editCode) return;
    const code = editCode.code?.trim().toUpperCase();
    if (!code) return;

    setSaving(true);
    setError('');

    const payload = {
      code,
      label: (editCode.label ?? '').trim(),
      is_active: editCode.is_active ?? true,
    };

    const { error: saveError } = editCode.id
      ? await supabase.from('access_codes').update(payload).eq('id', editCode.id)
      : await supabase.from('access_codes').insert(payload);

    setSaving(false);

    if (saveError) {
      setError(
        saveError.code === '23505'
          ? 'That code already exists — pick a different one.'
          : `Could not save: ${saveError.message}`,
      );
      return;
    }

    setEditCode(null);
    fetchData();
  }

  async function toggleActive(code: AccessCode) {
    await supabase.from('access_codes').update({ is_active: !code.is_active }).eq('id', code.id);
    fetchData();
  }

  async function deleteCode(id: string) {
    if (!confirm('Delete this access code?')) return;
    await supabase.from('access_codes').delete().eq('id', id);
    fetchData();
  }

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-text-dark">Access Codes</h1>
        <Button size="sm" onClick={() => setEditCode({ code: '', label: '', is_active: true })}>
          + Access Code
        </Button>
      </div>
      <p className="mb-6 max-w-2xl font-body text-sm text-text-light">
        Let a specific group order while the shop is closed to everyone else — a brothers&apos;
        meeting during youth service, or security on shift. Give them a code; the menu stays closed
        for everyone without one. Turn a code off the moment their window is over.
      </p>

      <div className="space-y-3">
        {codes.map((code) => (
          <Card key={code.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono font-heading font-bold text-text-dark">{code.code}</h3>
                  <Badge variant={code.is_active ? 'success' : 'neutral'}>
                    {code.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm text-text-light">
                  {code.label || <span className="italic">No label</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant={code.is_active ? 'ghost' : 'success'}
                  onClick={() => toggleActive(code)}
                  className="border border-gray-200"
                >
                  {code.is_active ? 'Disable' : 'Enable'}
                </Button>
                <button
                  onClick={() => setEditCode(code)}
                  className="cursor-pointer text-sm text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteCode(code.id)}
                  className="cursor-pointer text-sm text-danger hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </Card>
        ))}
        {codes.length === 0 && (
          <Card className="py-8 text-center">
            <p className="text-text-light">No access codes yet</p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={!!editCode}
        onClose={() => setEditCode(null)}
        title={editCode?.id ? 'Edit Access Code' : 'New Access Code'}
        size="sm"
      >
        {editCode && (
          <div className="space-y-4">
            <Input
              label="Code"
              value={editCode.code || ''}
              onChange={(e) => setEditCode({ ...editCode, code: e.target.value.toUpperCase() })}
              placeholder="e.g. BROTHERS"
            />
            <Input
              label="Label (who it's for)"
              value={editCode.label || ''}
              onChange={(e) => setEditCode({ ...editCode, label: e.target.value })}
              placeholder="e.g. Brothers Meeting"
            />
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-gray-100 p-3">
              <input
                type="checkbox"
                checked={editCode.is_active ?? true}
                onChange={(e) => setEditCode({ ...editCode, is_active: e.target.checked })}
                className="h-5 w-5 accent-primary"
              />
              <span className="font-accent text-sm font-semibold text-text-dark">
                Active — customers can use this code now
              </span>
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditCode(null)}>
                Cancel
              </Button>
              <Button onClick={saveCode} disabled={saving || !editCode.code?.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
