import React, { useEffect, useState } from "react";
import { Spells } from "./Spells";
import { Inventory } from "./Inventory";

export default function Character() {
  const [players, setPlayers] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<any>(null);
  const [vfResults, setVfResults] = useState<any[]>([]);

  // Load saved selection from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("selectedPlayer");
    if (saved) {
      setSelected(saved);
    }
  }, []);

  // Fetch player list (from backend)
  useEffect(() => {
    fetch("/api/players")
      .then(res => res.json())
      .then(setPlayers)
      .catch(err => console.error("Failed to fetch players", err));
  }, []);

  // Fetch sheet when player selected
  useEffect(() => {
    if (selected) {
      localStorage.setItem("selectedPlayer", selected);
      fetch(`/api/player/${selected}`)
        .then(res => res.json())
        .then(setSheet)
        .catch(() => setSheet(null));
    }
  }, [selected]);

  // Listen for sheet updates (from Spells) and refresh local sheet state
  useEffect(() => {
    const handler = (e: any) => {
      if (!e?.detail) return;
      setSheet(e.detail);
    };
    window.addEventListener('vf-sheet-updated', handler);
    return () => window.removeEventListener('vf-sheet-updated', handler);
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">Character</h2>
      <div className="mb-3">
        <strong>Classes:</strong>
        <span className="ml-2 text-sm text-gray-300">{sheet?.class ?? 'Not set'}</span>
        <button className="ml-3 px-2 py-1 bg-gray-600 text-white rounded" onClick={async () => {
          const val = window.prompt('Edit classes (e.g. Wizard 5, Fighter 2)', sheet?.class ?? '');
          if (val === null) return;
          const newSheet = { ...(sheet || {}), class: val };
          setSheet(newSheet);
          if (selected) await fetch(`/api/player/${selected}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSheet) });
          alert('Classes updated');
        }}>Edit Classes</button>
        <button className="ml-2 px-2 py-1 bg-yellow-600 text-white rounded" onClick={async () => {
          try {
            const q = window.prompt('Search VaultForge for class/subclass/feat/background (name)');
            if (!q) return;
            const res = await fetch(`/api/vaultforge/search?q=${encodeURIComponent(q)}&type=all`);
            if (!res.ok) return alert('Search failed');
            const rs = await res.json();
            if (!rs || !rs.length) return alert('No results');
            const first = rs[0];
            const uid = first.uid ?? `${first.name}|${first.source ?? 'Unknown'}`;
            const exp = await fetch(`/api/vaultforge/export?uid=${encodeURIComponent(uid)}`);
            if (!exp.ok) return alert('Export failed');
            const payload = await exp.json();
            const newSheet: any = { ...(sheet || {}) };
            // Map classes/subclasses
            if ((payload.type || '').toLowerCase().includes('class') || payload.raw?.class) {
              newSheet.class = payload.name;
              // add subclasses or class features into traits.class_features
              const subs = payload.raw?.subclasses ?? payload.raw?.subclass ?? payload.subclasses ?? null;
              newSheet.traits = newSheet.traits || {};
              newSheet.traits.class_features = newSheet.traits.class_features || [];
              if (Array.isArray(subs)) for (const s of subs) newSheet.traits.class_features.push(typeof s === 'string' ? s : (s.name || JSON.stringify(s)));
            }
            // Map feats
            if ((payload.type || '').toLowerCase().includes('feat') || payload.raw?.feat) {
              newSheet.traits = newSheet.traits || {};
              newSheet.traits.feats = newSheet.traits.feats || '';
              const f = payload.name || payload.title || '';
              newSheet.traits.feats = (newSheet.traits.feats ? newSheet.traits.feats + '\n' : '') + f;
            }
            // Map backgrounds
            if ((payload.type || '').toLowerCase().includes('background') || payload.raw?.background) {
              newSheet.details = newSheet.details || {};
              newSheet.details.backstory = (newSheet.details.backstory ? newSheet.details.backstory + '\n' : '') + (payload.name || payload.title || '');
            }
            // Map combat-relevant fields if present
            newSheet.combat = newSheet.combat || {};
            if (payload.raw?.bab) newSheet.combat.baseAttack = payload.raw.bab;
            if (payload.raw?.proficiencyBonus) newSheet.combat.proficiency_bonus = payload.raw.proficiencyBonus;

            // Persist
            if (selected) {
              await fetch(`/api/player/${selected}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSheet) });
            }
            setSheet(newSheet);
            const evt = new CustomEvent('vf-sheet-updated', { detail: newSheet });
            window.dispatchEvent(evt);
            alert('Imported ' + (payload.name || uid));
          } catch (e) { console.error(e); alert('Advanced import failed'); }
        }}>Advanced Import (VF)</button>
      </div>

      {/* Spells and Inventory components — they read/update the character via API */}
      {sheet && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Spells
              spells={(() => {
                const out: any[] = [];
                const s = sheet.spells || {};
                if (Array.isArray(s.cantrips)) for (const c of s.cantrips) out.push({ name: c.name || c, level: 0, school: '', prepared: false });
                for (const k of Object.keys(s)) {
                  const m = k.match(/^level_(\\d+)_prepared$/);
                  if (m) {
                    const lvl = parseInt(m[1], 10);
                    for (const it of s[k]) out.push({ name: it.name || it, level: lvl, school: '', prepared: false });
                  }
                }
                return out;
              })()}
              onTogglePrepared={async (idx) => {
                alert('Toggle prepared not implemented');
              }}
              onRemove={async (idx) => {
                try {
                  const flat: any[] = [];
                  const s = sheet.spells || {};
                  if (Array.isArray(s.cantrips)) for (const c of s.cantrips) flat.push({ name: c.name || c, level: 0 });
                  for (const k of Object.keys(s)) {
                    const m = k.match(/^level_(\\d+)_prepared$/);
                    if (m) {
                      const lvl = parseInt(m[1], 10);
                      for (const it of s[k]) flat.push({ name: it.name || it, level: lvl });
                    }
                  }
                  flat.splice(idx, 1);
                  const newSpells: any = {};
                  for (const e of flat) {
                    if (e.level === 0) { newSpells.cantrips = newSpells.cantrips || []; newSpells.cantrips.push({ name: e.name }); }
                    else { const key = `level_${e.level}_prepared`; newSpells[key] = newSpells[key] || []; newSpells[key].push({ name: e.name }); }
                  }
                  const newSheet = { ...(sheet || {}), spells: newSpells };
                  setSheet(newSheet);
                  if (selected) await fetch(`/api/player/${selected}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSheet) });
                } catch (e) { console.error(e); alert('Failed to remove spell'); }
              }}
            />
          </div>
          <div>
            <Inventory
              items={sheet.inventory ?? []}
              onRemove={async (idx) => {
                try {
                  const newInv = (sheet.inventory || []).slice();
                  newInv.splice(idx, 1);
                  const newSheet = { ...(sheet || {}), inventory: newInv };
                  setSheet(newSheet);
                  if (selected) await fetch(`/api/player/${selected}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSheet) });
                } catch (e) { console.error(e); alert('Failed to remove item'); }
              }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id="vf-search-input"
          className="bg-gray-700 text-gray-200 p-2 rounded flex-1"
          placeholder="Search VaultForge..."
        />
        <button
          className="ml-0 px-2 py-1 bg-indigo-600 text-white rounded"
          onClick={async () => {
            const el = document.getElementById('vf-search-input') as HTMLInputElement | null;
            const q = el?.value?.trim();
            if (!q) return alert('Enter search terms');
            try {
              // try server-side search first
              let res = await fetch(`/api/vaultforge/search?q=${encodeURIComponent(q)}&type=all`);
              let results = [];
              if (res.ok) {
                results = await res.json();
              } else {
                const idxRes = await fetch('/vaultforge/cache/master-index.json');
                if (!idxRes.ok) throw new Error('master-index not found');
                const idx = await idxRes.json();
                results = Object.keys(idx.spells || {}).filter(u => (u.split('|')[0] || '').toLowerCase().includes(q.toLowerCase())).map(uid => ({ uid }));
              }
              setVfResults(results.slice(0,50));
            } catch (e) {
              console.error('Search failed', e);
              alert('Search failed; check console');
            }
          }}
        >
          Search VaultForge
        </button>
        <select
          className="bg-gray-800 text-gray-200 p-2 rounded"
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">-- Select Character --</option>
          {players.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      {vfResults && vfResults.length ? (
        <div className="mt-2 space-y-2">
          {vfResults.map((r: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-2 bg-gray-800 rounded">
              <div className="text-sm">{r.name ?? r.uid}</div>
              <button className="px-2 py-1 bg-green-600 text-white rounded" onClick={async () => {
                try {
                  const uid = r.uid ?? `${r.name}|${r.source ?? r.file ?? 'Unknown'}`;
                  const payloadRes = await fetch(`/api/vaultforge/export?uid=${encodeURIComponent(uid)}`);
                  if (!payloadRes.ok) throw new Error('export failed');
                  const payload = await payloadRes.json();
                  const sel = selected ?? localStorage.getItem('selectedPlayer');
                  if (!sel) return alert('Select a character first');
                  const shRes = await fetch(`/api/player/${sel}`); if (!shRes.ok) throw new Error('failed to load character');
                  const sh = await shRes.json();
                  const newSheet = { ...(sh || {}) };
                  // Merge payload similar to other imports (items/spells)
                  if (payload.type === 'Item' || (payload.raw && (payload.raw.type === 'item' || payload.raw.item))) {
                    newSheet.inventory = newSheet.inventory || [];
                    newSheet.inventory.push({ name: payload.name, qty: 1, cost: payload.value ?? payload.raw?.value ?? 0, rarity: payload.rarity ?? payload.raw?.rarity ?? '', source: payload.source ?? payload.raw?.source ?? '', grantedBy: '5eTools' });
                  }
                  if (payload.type === 'Spell' || (payload.raw && (payload.raw.spell || payload.raw.spells))) {
                    newSheet.spells = newSheet.spells || {};
                    const lvl = payload.level ?? 0;
                    if (lvl === 0) { newSheet.spells.cantrips = newSheet.spells.cantrips || []; newSheet.spells.cantrips.push({ name: payload.name }); }
                    else { const key = `level_${lvl}_prepared`; newSheet.spells[key] = newSheet.spells[key] || []; newSheet.spells[key].push({ name: payload.name }); }
                  }
                  await fetch(`/api/player/${sel}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSheet) });
                  setVfResults([]);
                  const evt = new CustomEvent('vf-sheet-updated', { detail: newSheet });
                  window.dispatchEvent(evt);
                  alert('Imported ' + payload.name);
                } catch (e) { console.error(e); alert('Import failed'); }
              }}>Import</button>
            </div>
          ))}
        </div>
      ) : null}

      {sheet ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{sheet.name}</h3>
              <p>Class: {sheet.class} | Race: {sheet.race}</p>
              <p>HP: {sheet.hp?.hp_current}/{sheet.hp?.hp_max}</p>
            </div>
            <div>
              <button
                className="ml-3 px-2 py-1 bg-green-600 text-white rounded"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    const payload = JSON.parse(text);
                    if (!payload || !payload.name) throw new Error('Invalid payload');
                    const newSheet = { ...(sheet || {}) };

                    // Map speed (extract first number found)
                    if (payload.speed) {
                      const sp = String(payload.speed);
                      const m = sp.match(/\d+/);
                      const num = m ? parseInt(m[0], 10) : null;
                      if (num) newSheet.combat = { ...(newSheet.combat || {}), speed: num };
                    }

                    // Traits -> structured list
                    if (payload.traits && Array.isArray(payload.traits)) {
                      newSheet.traits = newSheet.traits || {};
                      newSheet.traits.race_features = newSheet.traits.race_features || [];
                      for (const t of payload.traits) {
                        newSheet.traits.race_features.push({ title: '', text: String(t) });
                      }
                    }

                    // Inventory items
                    if (payload.type === 'Item' || (payload.raw && (payload.raw.type === 'item' || payload.raw.item))) {
                      newSheet.inventory = newSheet.inventory || [];
                      newSheet.inventory.push({
                        name: payload.name,
                        qty: 1,
                        cost: payload.value ?? payload.raw?.value ?? 0,
                        rarity: payload.rarity ?? payload.raw?.rarity ?? '',
                        source: payload.source ?? payload.raw?.source ?? '',
                        grantedBy: '5eTools'
                      });
                    }

                    // Spells
                    if (payload.type === 'Spell' || (payload.raw && (payload.raw.spell || payload.raw.spells))) {
                      newSheet.spells = newSheet.spells || {};
                      newSheet.spells.cantrips = newSheet.spells.cantrips || [];
                      const lvl = payload.level ?? 0;
                      if (lvl === 0) newSheet.spells.cantrips.push({ name: payload.name });
                      else {
                        const key = `level_${lvl}_prepared`;
                        newSheet.spells[key] = newSheet.spells[key] || [];
                        newSheet.spells[key].push({ name: payload.name });
                      }
                    }

                    // Prefer any explicit grantedSpells/grantedItems in raw
                    if (payload.raw) {
                      if (Array.isArray(payload.raw.grantedSpells)) {
                        newSheet.spells = newSheet.spells || {};
                        newSheet.spells.cantrips = newSheet.spells.cantrips || [];
                        for (const gs of payload.raw.grantedSpells) {
                          const name = gs.name || gs;
                          const lvl = gs.level ?? 0;
                          if (lvl === 0) newSheet.spells.cantrips.push({ name });
                          else {
                            const key = `level_${lvl}_prepared`;
                            newSheet.spells[key] = newSheet.spells[key] || [];
                            newSheet.spells[key].push({ name });
                          }
                        }
                      }
                      if (Array.isArray(payload.raw.grantedItems)) {
                        newSheet.inventory = newSheet.inventory || [];
                        for (const gi of payload.raw.grantedItems) {
                          newSheet.inventory.push({
                            name: gi.name || gi,
                            qty: gi.qty ?? 1,
                            cost: gi.cost ?? 0,
                            rarity: gi.rarity ?? '',
                            source: gi.source ?? payload.source ?? '',
                            grantedBy: '5eTools'
                          });
                        }
                      }
                    }

                    setSheet(newSheet);

                    // Persist to backend
                    if (selected) {
                      const res = await fetch(`/api/player/${selected}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newSheet),
                      });
                      if (!res.ok) {
                        const txt = await res.text().catch(() => res.statusText);
                        throw new Error('Save failed: ' + txt);
                      }
                    }

                    alert('Imported ' + payload.name + ' into sheet and saved.');
                  } catch (e) {
                    console.error('Import failed', e);
                    alert('Failed to import/persist payload. Copy the JSON from VaultForge preview first.');
                  }
                }}
              >
                Import from 5eTools
              </button>
              <button
                className="ml-3 px-2 py-1 bg-blue-600 text-white rounded"
                onClick={async () => {
                  try {
                    const text = window.prompt('Paste VaultForge JSON here');
                    if (!text) throw new Error('No input provided');
                    const payload = JSON.parse(text);
                    if (!payload || !payload.name) throw new Error('Invalid payload');
                    const newSheet = { ...(sheet || {}) };

                    // Map speed (extract first number found)
                    if (payload.speed) {
                      const sp = String(payload.speed);
                      const m = sp.match(/\d+/);
                      const num = m ? parseInt(m[0], 10) : null;
                      if (num) newSheet.combat = { ...(newSheet.combat || {}), speed: num };
                    }

                    // Traits -> structured list
                    if (payload.traits && Array.isArray(payload.traits)) {
                      newSheet.traits = newSheet.traits || {};
                      newSheet.traits.race_features = newSheet.traits.race_features || [];
                      for (const t of payload.traits) {
                        newSheet.traits.race_features.push({ title: '', text: String(t) });
                      }
                    }

                    // Inventory items
                    if (payload.type === 'Item' || (payload.raw && (payload.raw.type === 'item' || payload.raw.item))) {
                      newSheet.inventory = newSheet.inventory || [];
                      newSheet.inventory.push({
                        name: payload.name,
                        qty: 1,
                        cost: payload.value ?? payload.raw?.value ?? 0,
                        rarity: payload.rarity ?? payload.raw?.rarity ?? '',
                        source: payload.source ?? payload.raw?.source ?? '',
                        grantedBy: '5eTools'
                      });
                    }

                    // Spells
                    if (payload.type === 'Spell' || (payload.raw && (payload.raw.spell || payload.raw.spells))) {
                      newSheet.spells = newSheet.spells || {};
                      newSheet.spells.cantrips = newSheet.spells.cantrips || [];
                      const lvl = payload.level ?? 0;
                      if (lvl === 0) newSheet.spells.cantrips.push({ name: payload.name });
                      else {
                        const key = `level_${lvl}_prepared`;
                        newSheet.spells[key] = newSheet.spells[key] || [];
                        newSheet.spells[key].push({ name: payload.name });
                      }
                    }

                    // Prefer any explicit grantedSpells/grantedItems in raw
                    if (payload.raw) {
                      if (Array.isArray(payload.raw.grantedSpells)) {
                        newSheet.spells = newSheet.spells || {};
                        newSheet.spells.cantrips = newSheet.spells.cantrips || [];
                        for (const gs of payload.raw.grantedSpells) {
                          const name = gs.name || gs;
                          const lvl = gs.level ?? 0;
                          if (lvl === 0) newSheet.spells.cantrips.push({ name });
                          else {
                            const key = `level_${lvl}_prepared`;
                            newSheet.spells[key] = newSheet.spells[key] || [];
                            newSheet.spells[key].push({ name });
                          }
                        }
                      }
                      if (Array.isArray(payload.raw.grantedItems)) {
                        newSheet.inventory = newSheet.inventory || [];
                        for (const gi of payload.raw.grantedItems) {
                          newSheet.inventory.push({
                            name: gi.name || gi,
                            qty: gi.qty ?? 1,
                            cost: gi.cost ?? 0,
                            rarity: gi.rarity ?? '',
                            source: gi.source ?? payload.source ?? '',
                            grantedBy: '5eTools'
                          });
                        }
                      }
                    }

                    setSheet(newSheet);

                    // Persist to backend
                    if (selected) {
                      const res = await fetch(`/api/player/${selected}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newSheet),
                      });
                      if (!res.ok) {
                        const txt = await res.text().catch(() => res.statusText);
                        throw new Error('Save failed: ' + txt);
                      }
                    }

                    alert('Imported ' + payload.name + ' into sheet and saved.');
                  } catch (e) {
                    console.error('Paste import failed', e);
                    alert('Failed to parse/persist pasted JSON.');
                  }
                }}
              >
                Paste 5eTools JSON
              </button>
            </div>
          </div>
        </div>
      ) : (
        selected && <p className="mt-4">No sheet data found.</p>
      )}
    </div>
  );
}

