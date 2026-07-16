'use client';

/**
 * Builds the sample the label preview draws, from the shop's REAL modifier groups and
 * options. Picking options here (rather than relying on canned sample data) is what lets
 * the per-category size / hide / order controls show up in the preview, because the group
 * names match the ones those settings are keyed to.
 */

export interface PreviewContent {
  customerName: string;
  drinkName: string;
  note: string;
  temp: 'hot' | 'iced' | null;
  multiCup: boolean;
  /** Chosen options per group name. */
  selected: Record<string, string[]>;
}

export const DEFAULT_PREVIEW_CONTENT: PreviewContent = {
  customerName: 'Sarah K',
  drinkName: 'Vanilla Latte',
  note: 'Extra hot, light foam',
  temp: 'iced',
  multiCup: true,
  selected: {},
};

export default function PreviewComposer({
  groups,
  value,
  onChange,
}: {
  groups: { name: string; options: string[] }[];
  value: PreviewContent;
  onChange: (next: PreviewContent) => void;
}) {
  const set = (changes: Partial<PreviewContent>) => onChange({ ...value, ...changes });

  const toggleOption = (group: string, option: string) => {
    const current = value.selected[group] ?? [];
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    onChange({ ...value, selected: { ...value.selected, [group]: next } });
  };

  const input =
    'w-full rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-sm text-text-dark focus:border-primary focus:outline-none';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block font-body text-xs text-text-light">Customer name</span>
          <input className={input} value={value.customerName} onChange={(e) => set({ customerName: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-xs text-text-light">Drink</span>
          <input className={input} value={value.drinkName} onChange={(e) => set({ drinkName: e.target.value })} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block font-body text-xs text-text-light">Special instructions</span>
        <input className={input} value={value.note} onChange={(e) => set({ note: e.target.value })} placeholder="(leave blank for none)" />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="font-body text-xs text-text-light">Cup:</span>
          {([['hot', 'Hot'], ['iced', 'Cold'], [null, 'None']] as const).map(([t, lbl]) => (
            <button
              key={lbl}
              onClick={() => set({ temp: t })}
              className={`cursor-pointer rounded-full px-2.5 py-1 font-accent text-xs font-semibold transition-colors ${
                value.temp === t ? 'bg-primary text-white' : 'bg-bg text-text-light hover:bg-gray-100'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value.multiCup}
            onChange={(e) => set({ multiCup: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-body text-xs text-text-light">Multi-cup (shows counter)</span>
        </label>
      </div>

      {groups.length > 0 && (
        <div className="space-y-3 border-t border-gray-100 pt-3">
          {groups.map((g) => (
            <div key={g.name}>
              <p className="mb-1.5 font-body text-xs font-semibold text-text-dark">{g.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.options.length === 0 && (
                  <span className="font-body text-xs text-text-light">(no options)</span>
                )}
                {g.options.map((opt) => {
                  const on = (value.selected[g.name] ?? []).includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleOption(g.name, opt)}
                      className={`cursor-pointer rounded-full border px-2.5 py-1 font-accent text-xs transition-colors ${
                        on
                          ? 'border-primary bg-primary text-white'
                          : 'border-gray-200 bg-surface text-text-light hover:border-primary/40'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
