'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import type { Event } from '@/types';

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [editEvent, setEditEvent] = useState<Partial<Event> | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    if (data) setEvents(data);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function saveEvent() {
    if (!editEvent) return;
    setSaving(true);
    if (editEvent.id) {
      await supabase.from('events').update({
        name: editEvent.name,
        is_all_free: editEvent.is_all_free,
      }).eq('id', editEvent.id);
    } else {
      await supabase.from('events').insert({
        name: editEvent.name,
        is_all_free: editEvent.is_all_free || false,
        is_active: false,
      });
    }
    setSaving(false); setEditEvent(null); fetchData();
  }

  async function toggleActive(event: Event) {
    // Deactivate all, then activate this one (or deactivate if already active)
    await supabase.from('events').update({ is_active: false }).neq('id', '');
    if (!event.is_active) {
      await supabase.from('events').update({ is_active: true }).eq('id', event.id);
    }
    fetchData();
  }

  async function deleteEvent(id: string) {
    await supabase.from('events').delete().eq('id', id);
    fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-dark">Event Pricing</h1>
          <p className="text-sm text-text-light mt-1">Create pricing profiles for different events. Only one can be active at a time.</p>
        </div>
        <Button size="sm" onClick={() => setEditEvent({ name: '', is_all_free: false })}>
          + Event
        </Button>
      </div>

      <div className="space-y-3">
        {events.map((event) => (
          <Card key={event.id} className={event.is_active ? 'ring-2 ring-success/30' : ''}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="font-heading font-bold text-text-dark">{event.name}</h3>
                  <div className="flex gap-2 mt-1">
                    {event.is_active && <Badge variant="success">Active</Badge>}
                    {event.is_all_free && <Badge variant="secondary">Everything Free</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={event.is_active ? 'danger' : 'success'}
                  onClick={() => toggleActive(event)}
                >
                  {event.is_active ? 'Deactivate' : 'Activate'}
                </Button>
                <button onClick={() => setEditEvent(event)} className="text-sm text-primary hover:underline cursor-pointer">Edit</button>
                <button onClick={() => deleteEvent(event.id)} className="text-sm text-danger hover:underline cursor-pointer">Delete</button>
              </div>
            </div>
          </Card>
        ))}
        {events.length === 0 && (
          <Card className="text-center py-8">
            <p className="text-text-light">No events created yet</p>
          </Card>
        )}
      </div>

      <Modal isOpen={!!editEvent} onClose={() => setEditEvent(null)} title={editEvent?.id ? 'Edit Event' : 'New Event'} size="sm">
        {editEvent && (
          <div className="space-y-4">
            <Input label="Event Name" value={editEvent.name || ''} onChange={(e) => setEditEvent({ ...editEvent, name: e.target.value })} placeholder="e.g., Sunday Morning, Youth Night" />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editEvent.is_all_free || false} onChange={(e) => setEditEvent({ ...editEvent, is_all_free: e.target.checked })} className="accent-primary" />
              <span className="text-sm font-body">Everything free during this event</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditEvent(null)}>Cancel</Button>
              <Button onClick={saveEvent} disabled={saving || !editEvent.name}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
