import React, { useState } from "react";


interface Spell {
name: string;
level: number;
school: string;
prepared?: boolean;
}


interface SpellsProps {
spells: Spell[];
onTogglePrepared: (index: number) => void;
onRemove: (index: number) => void;
}


export function Spells({ spells, onTogglePrepared, onRemove }: SpellsProps) {
const [matches, setMatches] = useState<string[]>([]);
const spellsList = Array.isArray(spells) ? spells : [];


return (
<div className="p-4">
<h2 className="text-xl font-bold mb-4">✨ Spells</h2>
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
{spellsList.length === 0 ? (
  <p>No spells known.</p>
) : (
  spellsList.map((spell, idx) => (
    <div
    key={idx}
    className="p-3 rounded-lg bg-gray-700 shadow flex justify-between"
    >
    <div>
    <h3 className="font-semibold">{spell.name}</h3>
    <p className="text-sm text-gray-300">
    L{spell.level} • {spell.school}
    </p>
    <p className="text-sm">
    {spell.prepared ? "✅ Prepared" : "❌ Not prepared"}
    </p>
    </div>
    <div className="flex flex-col gap-2">
    <button
    className="px-3 py-1 bg-blue-600 text-white rounded"
    onClick={() => onTogglePrepared(idx)}
    >
    Toggle
    </button>
    <button
    className="px-3 py-1 bg-red-600 text-white rounded"
    onClick={() => onRemove(idx)}
    >
    Remove
    </button>
    </div>
    </div>
  ))
)}
</div>

<div className="mt-4">
  <h3 className="text-lg font-semibold">Find & Import Spell</h3>
  <div className="flex gap-2 mt-2">
    <input id="spell-search" className="flex-1 p-2 rounded bg-gray-700 text-gray-200" placeholder="Spell name" />
    <button className="px-3 py-1 bg-yellow-600 text-white rounded" onClick={async () => {
      try {
        const qEl = document.getElementById('spell-search') as HTMLInputElement | null;
        const q = qEl?.value?.trim();
        if (!q) return alert('Enter spell name');
        // load selected character early so we can filter results by class/level
        const sel = localStorage.getItem('selectedPlayer'); if (!sel) return alert('Select a character first');
        const shRes = await fetch(`/api/player/${sel}`); if (!shRes.ok) throw new Error('failed to load character');
        const sh = await shRes.json();
        const charLevel = Number(sh.level ?? sh.core?.level ?? 0);
        const charClass = String(sh.class ?? sh.core?.class ?? '').split(/[ ,\/]+/)[0] || '';

        // Try server-side search endpoint first (returns richer data to filter by class/level)
        let matches: string[] = [];
        try {
          const searchRes = await fetch(`/api/vaultforge/search?q=${encodeURIComponent(q)}&type=spells`);
          if (searchRes.ok) {
            const results = await searchRes.json();
            for (const r of results) {
              const lvl = r.level ?? r.raw?.level ?? 0;
              if (charLevel && lvl > charLevel) continue;
              if (charClass) {
                const classes = r.classes ?? r.raw?.classes ?? r.raw?.class ?? [];
                const clsArr = Array.isArray(classes) ? classes.map((c: any) => (c && c.name) ? c.name : c) : [classes];
                if (clsArr.length && !clsArr.some((c: any) => String(c).toLowerCase().includes(charClass.toLowerCase()))) continue;
              }
              if (r.uid) matches.push(r.uid);
            }
          }
        } catch (e) {
          // ignore search errors and fall back
        }

        // Fallback to master-index name-only matching if server-side search produced no matches
        if (!matches.length) {
          const idxRes = await fetch('/vaultforge/cache/master-index.json');
          if (!idxRes.ok) throw new Error('master-index missing');
          const idx = await idxRes.json();
          matches = Object.keys(idx.spells || {}).filter((u: string) => (u.split('|')[0] || '').toLowerCase().includes(q.toLowerCase()));
        }

        setMatches(matches);
        if (!matches.length) return alert('No matches');
        const uid = matches[0];
        const payloadRes = await fetch(`/api/vaultforge/export?uid=${encodeURIComponent(uid)}`);
        if (!payloadRes.ok) throw new Error('export failed');
        const payload = await payloadRes.json();
        const sel = localStorage.getItem('selectedPlayer'); if (!sel) return alert('Select a character first');
        const shRes = await fetch(`/api/player/${sel}`); if (!shRes.ok) throw new Error('failed to load character');
        const sh = await shRes.json();
        // Determine character level and primary class
        const charLevel = Number(sh.level ?? sh.core?.level ?? 0);
        const charClass = String(sh.class ?? sh.core?.class ?? '').split(/[ ,\/]+/)[0] || '';
        // Check spell availability by level and class (if present)
        const spellLevel = payload.level ?? payload.raw?.level ?? 0;
        if (charLevel && spellLevel > charLevel) return alert('Spell too high level for character');
        if (charClass) {
          const classes = payload.classes ?? payload.raw?.classes ?? payload.raw?.class ?? [];
          const clsArr = Array.isArray(classes) ? classes.map((c: any) => (c && c.name) ? c.name : c) : [classes];
          if (clsArr.length && !clsArr.some((c: any) => String(c).toLowerCase().includes(charClass.toLowerCase()))) return alert('Spell not available to class');
        }
        const newSheet = { ...(sh || {}) };
        const lvl = payload.level ?? 0;
        newSheet.spells = newSheet.spells || {};
        if (lvl === 0) { newSheet.spells.cantrips = newSheet.spells.cantrips || []; newSheet.spells.cantrips.push({ name: payload.name }); }
        else { const key = `level_${lvl}_prepared`; newSheet.spells[key] = newSheet.spells[key] || []; newSheet.spells[key].push({ name: payload.name }); }
        await fetch(`/api/player/${sel}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSheet) });
        alert('Imported ' + payload.name);
        setMatches([]);
        const evt = new CustomEvent('vf-sheet-updated', { detail: newSheet });
        window.dispatchEvent(evt);
      } catch (e) { console.error(e); alert('Import failed'); }
    }}>
      Import
    </button>
  </div>
  {matches && matches.length ? (
    <div className="mt-2 space-y-2">
      {matches.slice(0,10).map((uid, i) => (
        <div key={i} className="flex items-center justify-between p-2 bg-gray-800 rounded">
          <div className="text-sm">{uid}</div>
          <button className="px-2 py-1 bg-green-600 text-white rounded" onClick={async () => {
            try {
              const payloadRes = await fetch(`/api/vaultforge/export?uid=${encodeURIComponent(uid)}`);
              if (!payloadRes.ok) throw new Error('export failed');
              const payload = await payloadRes.json();
              const sel = localStorage.getItem('selectedPlayer'); if (!sel) return alert('Select a character first');
              const shRes = await fetch(`/api/player/${sel}`); if (!shRes.ok) throw new Error('failed to load character');
              const sh = await shRes.json();
              const newSheet = { ...(sh || {}), spells: sh.spells || {} };
              const lvl = payload.level ?? 0;
              if (lvl === 0) { newSheet.spells.cantrips = newSheet.spells.cantrips || []; newSheet.spells.cantrips.push({ name: payload.name }); }
              else { const key = `level_${lvl}_prepared`; newSheet.spells[key] = newSheet.spells[key] || []; newSheet.spells[key].push({ name: payload.name }); }
              await fetch(`/api/player/${sel}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSheet) });
              alert('Imported ' + payload.name);
              setMatches([]);
              const evt = new CustomEvent('vf-sheet-updated', { detail: newSheet });
              window.dispatchEvent(evt);
            } catch (e) { console.error(e); alert('Import failed'); }
          }}>
            Import
          </button>
        </div>
      ))}
    </div>
  ) : null}
</div>
);

}
