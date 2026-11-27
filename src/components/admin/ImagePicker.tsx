'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { safeImageUrl, uploadPicture, type PictureFolder } from '@/lib/pictures';
import { Photo } from '@/components/menu/DrinkPicture';

/**
 * Choose a picture: upload one from this device (or drop it on), paste a link, or remove it.
 *
 * Built for somebody who isn't technical. "Choose a picture" opens the photo library on a
 * phone and the file browser on a computer; the photo is shrunk in the browser before it
 * goes up (see uploadPicture), so a 6 MB phone photo doesn't become a slow menu. Pasting a
 * link is still there, tucked away, for a picture that already lives on the web.
 *
 * Controlled: `value` is the picture's address (or null), `onChange` gets the new one.
 * Nothing is saved by this component — the page around it decides when.
 */
export default function ImagePicker({
  value,
  onChange,
  folder,
  label,
  hint,
  aspect = 'square',
  compact,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: PictureFolder;
  label?: string;
  hint?: string;
  /** The preview's shape — match where the picture is actually shown. */
  aspect?: 'square' | 'wide';
  /** A smaller preview beside the buttons, for tight places like a drink row. */
  compact?: boolean;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const url = safeImageUrl(value);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    const res = await uploadPicture(file, folder);
    setBusy(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    onChange(res.url);
  }

  function applyLink() {
    const clean = safeImageUrl(link);
    if (!clean) {
      setError('That doesn’t look like a picture link. It should start with https://');
      return;
    }
    setError('');
    setLink('');
    setLinkOpen(false);
    onChange(clean);
  }

  const preview = (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        take(e.dataTransfer.files?.[0]);
      }}
      disabled={busy}
      aria-label={url ? 'Change the picture' : 'Choose a picture'}
      className={cn(
        'group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-[border-color,background-color,transform] duration-200 active:scale-[0.98]',
        url ? 'border-transparent' : 'border-gray-300 bg-gray-50 hover:border-primary/50 hover:bg-primary/5',
        dragOver && 'border-primary bg-primary/10',
        compact ? 'h-20 w-20' : aspect === 'wide' ? 'aspect-[16/9] w-full' : 'aspect-square w-40',
      )}
    >
      {url ? (
        <>
          <Photo url={url} className="absolute inset-0 h-full w-full" />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-6 text-center font-accent text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            Change
          </span>
        </>
      ) : (
        <span className="flex flex-col items-center gap-1 px-2 text-center font-accent text-xs font-semibold text-text-light">
          <span aria-hidden className={compact ? 'text-xl' : 'text-3xl'}>
            🖼️
          </span>
          {!compact && 'Tap to choose, or drop a picture here'}
        </span>
      )}
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-sm">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/30 border-t-primary" />
        </span>
      )}
    </button>
  );

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block px-1 font-accent text-[13px] font-semibold text-text">
          {label}
        </label>
      )}

      <div className={cn('flex gap-4', compact || aspect === 'square' ? 'items-center' : 'flex-col')}>
        {preview}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="pressable cursor-pointer rounded-full bg-primary/10 px-4 py-2 font-accent text-sm font-semibold text-primary hover:bg-primary/15 disabled:opacity-50"
            >
              {busy ? 'Uploading…' : url ? 'Change picture' : 'Choose a picture'}
            </button>
            {url && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  onChange(null);
                }}
                disabled={busy}
                className="pressable cursor-pointer rounded-full px-4 py-2 font-accent text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                Remove
              </button>
            )}
            {!linkOpen && (
              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                className="cursor-pointer px-1 py-2 font-accent text-xs font-semibold text-text-light underline-offset-2 hover:text-text hover:underline"
              >
                Use a link instead
              </button>
            )}
          </div>

          {linkOpen && (
            <div className="flex animate-rise gap-2">
              <input
                id={inputId}
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyLink();
                  }
                }}
                placeholder="https://…"
                className="min-w-0 flex-1 rounded-xl border border-transparent bg-gray-100 px-3 py-2 font-body text-base text-text-dark placeholder:text-text-light focus:bg-surface"
              />
              <button
                type="button"
                onClick={applyLink}
                className="pressable shrink-0 cursor-pointer rounded-xl bg-primary px-4 font-accent text-sm font-semibold text-white"
              >
                Use
              </button>
            </div>
          )}

          {hint && !error && <p className="font-body text-xs leading-relaxed text-text-light">{hint}</p>}
          {error && (
            <p role="alert" className="animate-rise font-body text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          take(e.target.files?.[0]);
          // Cleared, so choosing the same file again after a failed upload still fires.
          e.target.value = '';
        }}
      />
    </div>
  );
}
