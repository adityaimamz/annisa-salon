import type { ReactNode } from 'react';

export interface TabDef<T extends string> { id: T; label: string }

/** Baris tab di atas satu view. Isi view (section.view) dirender sebagai children. */
export default function TabbedView<T extends string>({ tabs, value, onChange, label, children }: {
  tabs: TabDef<T>[]; value: T; onChange: (id: T) => void; label: string; children: ReactNode;
}) {
  return (
    <div className="tabview">
      <div className="tabview-bar">
        <div className="kind-tabs" role="tablist" aria-label={label}>
          {tabs.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
