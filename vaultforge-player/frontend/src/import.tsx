// React TypeScript — vaultforge-player/frontend/src/import.tsx
import React, { useState } from "react";
import { characterSchema } from "./schema";

export default function ImportTab() {
  const [results, setResults] = useState<any[]>([]);
  const [querying, setQuerying] = useState(false);
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");

  async function runSearch() {
    if (!q.trim()) return alert("Enter search terms");
    setQuerying(true);
    try {
      const res = await fetch(`/api/vaultforge/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`);
      if (res.ok) {
        const r = await res.json();
        setResults(r || []);
      } else {
        // fallback to master-index name match — try common locations and avoid hard failure
        let idx: any = null;
        const paths = ["/api/vaultforge/master-index", "/api/vaultforge/master-index.json", "/vaultforge/cache/master-index.json", "/cache/master-index.json"];
        for (const p of paths) {
          try {
            const r = await fetch(p);
            if (r.ok) { idx = await r.json(); break; }
          } catch (e) {
            // ignore and try next path
          }
        }
        if (!idx) {
          console.warn("master-index not found at known locations");
          setResults([]);
        } else {
          const uids = Object.keys(idx[type] || idx.spells || {}).filter((u: string) =>
            (u.split("|")[0] || "").toLowerCase().includes(q.toLowerCase())
          );
          setResults(uids.map((uid: string) => ({ uid })));
        }
      }
    } catch (e) {
      console.error("Import search failed", e);
      alert("Search failed (see console)");
    } finally {
      setQuerying(false);
    }
  }

  async function importUid(uidOrObj: any) {
    try {
      const uid = uidOrObj.uid ?? `${uidOrObj.name}|${uidOrObj.source ?? "Unknown"}`;
      const payloadRes = await fetch(`/api/vaultforge/export?uid=${encodeURIComponent(uid)}`);
      if (!payloadRes.ok) throw new Error("export failed");
      const payload = await payloadRes.json();

      const sel = localStorage.getItem("selectedPlayer");
      if (!sel) return alert("Select a character first");

      const shRes = await fetch(`/api/player/${encodeURIComponent(sel)}`);
      let sh: any = {};
      if (shRes.ok) {
        sh = await shRes.json();
      } else {
        console.warn('Player not found or failed to load; creating a minimal sheet');
        sh = { core: { name: sel } };
      }

      const newSheet = { ...(sh || {}) };

      // Helpers to add near the top of import.tsx (or where import mapping runs)
      function getPath(obj: any, path: string[]) { let cur = obj; for (const p of path) { if (!cur || typeof cur !== "object" || !(p in cur)) return undefined; cur = cur[p]; } return cur; }
      function setPath(obj: any, path: string[], value: any) { if (!path.length) return; let cur = obj; for (let i = 0; i < path.length - 1; i++) { const p = path[i]; if (!cur[p] || typeof cur[p] !== "object") cur[p] = {}; cur = cur[p]; } cur[path[path.length - 1]] = value; }
      // Write value to the first existing candidate path, otherwise create the first candidate (or fallback to ['undefined', ...])
      function writeToPreferredPaths(sheet: any, candidates: string[][], value: any) { for (const p of candidates) { if (getPath(sheet, p) !== undefined) { setPath(sheet, p, value); return p; } } if (candidates.length) { try { setPath(sheet, candidates[0], value); return candidates[0]; } catch { const fallback = ['undefined', ...candidates[0].slice(1)]; setPath(sheet, fallback, value); return fallback; } } return null; }

      // Show a small modal for class level/subclass/skill choices when importing classes
      if (newSheet.class) {
        const subs = payload.raw?.subclasses ?? payload.raw?.subclass ?? payload.subclasses ?? null;
        const ch = (payload.raw?.startingProficiencies ?? payload.startingProficiencies ?? {}).skills;
        const choice = Array.isArray(ch) ? ch.find((s:any)=>s && s.choose) : (ch && ch.choose ? ch : null);

        const result = await showImportModal({
          className: newSheet.class,
          currentLevel: newSheet.level ?? newSheet.core?.level ?? "",
          subclasses: Array.isArray(subs) ? subs.map((s:any)=> typeof s === 'string' ? s : (s.name || s)) : [],
          skillChoices: choice ? { options: choice.choose.from || [], count: choice.choose.count || 1 } : null,
        });

        if (result) {
          if (result.level != null) { newSheet.level = result.level; if (newSheet.core) newSheet.core.level = result.level; }
          if (result.subclass) { newSheet.subclass = result.subclass; if (newSheet.core) newSheet.core.subclass = result.subclass; }
          if (result.skills && result.skills.length) { newSheet.skills = newSheet.skills || []; newSheet.skills.push(...result.skills.slice(0, (choice?.choose?.count)||1)); }
        }
      }

      // Ensure core exists and map temporary selection arrays into core schema fields
      if (!newSheet.core || typeof newSheet.core !== 'object') newSheet.core = newSheet.core || {};
      // Map selected skills (from import modal) into core.proficiencies.skills (schema-driven selects)
      if (Array.isArray(newSheet.skills)) {
        newSheet.core.proficiencies = newSheet.core.proficiencies || {};
        newSheet.core.proficiencies.skills = newSheet.core.proficiencies.skills || {};
        for (const s of newSheet.skills) newSheet.core.proficiencies.skills[s] = 'proficient';
        delete newSheet.skills;
      }
      // Normalize traits.class_features to schema shape (title/text)
      if (newSheet.traits && Array.isArray(newSheet.traits.class_features)) {
        newSheet.traits.class_features = newSheet.traits.class_features.map((cf: any) => {
          if (!cf) return { title: '', text: '' };
          if (typeof cf === 'string') return { title: cf, text: '' };
          if (typeof cf === 'object') return { title: cf.title ?? cf.name ?? String(cf), text: cf.text ?? cf.description ?? '' };
          return { title: String(cf), text: '' };
        });
      }

      // Ensure core exists
      if (!newSheet.core || typeof newSheet.core !== 'object') newSheet.core = newSheet.core || {};

      // Map selected skills from transient newSheet.skills into core.proficiencies.skills
      if (Array.isArray(newSheet.skills)) {
        newSheet.core.proficiencies = newSheet.core.proficiencies || {};
        newSheet.core.proficiencies.skills = newSheet.core.proficiencies.skills || {};
        for (const s of newSheet.skills) newSheet.core.proficiencies.skills[s] = 'proficient';
        delete newSheet.skills;
      }

      // Map imported keys into schema groups/fields; anything not matched goes to newSheet.undefined
      const schema = (characterSchema as any) || {};
      const fallbackGroup = "undefined";
      newSheet[fallbackGroup] = newSheet[fallbackGroup] || {};
      const norm = (s:string)=>String(s||"").toLowerCase().replace(/[\s_]/g,"");

      // Recursively search the schema for a matching field name or label at any level
      function findFieldInSchema(node: any, key: string, path: string[] = []): { fieldName: string; path: string[] } | null {
        if (!node || typeof node !== 'object') return null;
        const fields = node.fields || node.itemFields;
        if (fields && typeof fields === 'object') {
          for (const fname of Object.keys(fields)) {
            const flabel = (fields as any)[fname].label ?? fname;
            if (norm(fname) === norm(key) || norm(flabel) === norm(key)) return { fieldName: fname, path };
          }
        }
        for (const childKey of Object.keys(node)) {
          if (childKey === 'fields' || childKey === 'itemFields') continue;
          const child = node[childKey];
          const res = findFieldInSchema(child, key, path.concat(childKey));
          if (res) return res;
        }
        return null;
      }

      // Collect candidates from top-level and core (legacy layout)
      type Candidate = { key: string; val: any; origin: 'root'|'core' };
      const candidates: Candidate[] = [];
      for (const k of Object.keys(newSheet)) {
        if (k === 'core' || k === fallbackGroup) continue;
        candidates.push({ key: k, val: (newSheet as any)[k], origin: 'root' });
      }
      if (newSheet.core && typeof newSheet.core === 'object') {
        for (const k of Object.keys(newSheet.core)) candidates.push({ key: k, val: newSheet.core[k], origin: 'core' });
      }

      // Helper: find schema group by normalized key or label
      function findSchemaGroupByKey(key: string) {
        const nk = norm(key);
        for (const g of Object.keys(schema)) {
          if (nk === norm(g)) return g;
          const lab = (schema as any)[g]?.label;
          if (typeof lab === 'string' && nk === norm(lab)) return g;
        }
        return null;
      }

      for (const c of candidates) {
        const k = c.key;
        const val = c.val;
        if (val === undefined || typeof val === 'function') continue;

        // If key matches a top-level schema group (by normalized match), move the whole group
        const groupMatch = findSchemaGroupByKey(k);
        if (groupMatch) {
          try {
            setPath(newSheet, [groupMatch], val);
            // remove original only after successful set
            if (c.origin === 'root') delete (newSheet as any)[k]; else delete newSheet.core[k];
            continue;
          } catch {
            // fallback to recording in undefined
            if (!Array.isArray(newSheet[fallbackGroup])) newSheet[fallbackGroup] = [];
            if (!(newSheet[fallbackGroup] as any[]).some((it:any)=>it && it.key === k)) {
              (newSheet[fallbackGroup] as any[]).push({ key: k, example: val });
            }
            if (c.origin === 'root') delete (newSheet as any)[k]; else delete newSheet.core[k];
            continue;
          }
        }

        // Otherwise try to match a field anywhere in the schema
        const match = findFieldInSchema(schema, k);
        if (match) {
          const dstPath = (match.path && match.path.length) ? match.path.concat(match.fieldName) : [match.fieldName];
          try {
            setPath(newSheet, dstPath, val);
            if (c.origin === 'root') delete (newSheet as any)[k]; else delete newSheet.core[k];
            continue;
          } catch {
            // fallthrough to record in undefined
          }
        }

        // Not matched — record example under undefined as structured data
        if (!Array.isArray(newSheet[fallbackGroup])) newSheet[fallbackGroup] = [];
        if (!(newSheet[fallbackGroup] as any[]).some((it:any)=>it && it.key === k)) {
          (newSheet[fallbackGroup] as any[]).push({ key: k, example: val });
        }
        if (c.origin === 'root') delete (newSheet as any)[k]; else delete newSheet.core[k];
      }

      // Persist (debug: log newSheet before saving)
      try {
        console.log("[VaultForge-Player][import] persisting newSheet for", sel, JSON.stringify(newSheet, null, 2));
      } catch (e) {
        console.log("[VaultForge-Player][import] persisting newSheet for", sel, newSheet);
      }
      await fetch(`/api/player/${encodeURIComponent(sel)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSheet),
      });

      // notify app/character
      const evt = new CustomEvent("vf-sheet-updated", { detail: newSheet });
      window.dispatchEvent(evt);
      alert("Imported " + (payload.name || uid));

      // Helper: show a modal for import choices (class level, subclass, skills)
      function showImportModal(opts: any): Promise<any> {
        return new Promise((resolve) => {
          const modal = document.createElement('div');
          Object.assign(modal.style, { position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: '9999' });
          const box = document.createElement('div');
          Object.assign(box.style, { background: '#111827', color: '#fff', padding: '16px', borderRadius: '8px', minWidth: '320px', maxWidth: '90%', boxSizing: 'border-box' });
          const title = document.createElement('h3'); title.textContent = `Import ${opts.className}`; title.style.margin = '0 0 8px 0'; box.appendChild(title);

          const lvlLabel = document.createElement('label'); lvlLabel.textContent = 'Level:'; lvlLabel.style.display = 'block'; lvlLabel.style.marginTop = '8px';
          const lvlInput = document.createElement('input'); lvlInput.type = 'number'; lvlInput.value = String(opts.currentLevel || ''); lvlInput.style.width = '100%'; lvlInput.style.marginTop = '4px'; lvlLabel.appendChild(lvlInput); box.appendChild(lvlLabel);

          let subclassSelect: HTMLSelectElement | null = null;
          if (opts.subclasses && opts.subclasses.length) {
            const sLabel = document.createElement('label'); sLabel.textContent = 'Subclass:'; sLabel.style.display = 'block'; sLabel.style.marginTop = '8px';
            subclassSelect = document.createElement('select'); subclassSelect.style.width = '100%'; subclassSelect.style.marginTop = '4px'; subclassSelect.appendChild(new Option('', ''));
            for (const s of opts.subclasses) subclassSelect.appendChild(new Option(String(s), String(s)));
            box.appendChild(sLabel); box.appendChild(subclassSelect);
          }

          let skillButtons: HTMLButtonElement[] = [];
          if (opts.skillChoices && Array.isArray(opts.skillChoices.options)) {
            const skLabel = document.createElement('div'); skLabel.textContent = `Choose ${opts.skillChoices.count} skills:`; skLabel.style.marginTop = '8px'; box.appendChild(skLabel);
            const skWrap = document.createElement('div'); skWrap.style.display = 'flex'; skWrap.style.flexWrap = 'wrap'; skWrap.style.gap = '6px'; skWrap.style.marginTop = '6px';
            for (const o of opts.skillChoices.options) {
              const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = String(o); btn.style.padding = '6px 8px'; btn.style.border = '1px solid #374151'; btn.style.background = 'transparent'; btn.style.color = '#fff'; btn.onclick = () => { btn.classList.toggle('selected'); btn.style.background = btn.classList.contains('selected') ? '#2563eb' : 'transparent'; };
              skWrap.appendChild(btn); skillButtons.push(btn);
            }
            box.appendChild(skWrap);
          }

          const btnBar = document.createElement('div'); btnBar.style.marginTop = '12px'; btnBar.style.display = 'flex'; btnBar.style.justifyContent = 'flex-end';
          const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel'; cancelBtn.onclick = () => { document.body.removeChild(modal); resolve(null); }; cancelBtn.style.marginRight = '8px';
          const okBtn = document.createElement('button'); okBtn.textContent = 'Confirm'; okBtn.onclick = () => {
            const level = parseInt(lvlInput.value, 10); const subclass = subclassSelect ? subclassSelect.value : null; const skills: string[] = [];
            for (const b of skillButtons) if (b.classList.contains('selected')) skills.push(b.textContent || '');
            document.body.removeChild(modal);
            resolve({ level: isNaN(level) ? null : level, subclass: subclass || null, skills });
          };
          btnBar.appendChild(cancelBtn); btnBar.appendChild(okBtn); box.appendChild(btnBar);
          modal.appendChild(box); document.body.appendChild(modal);
        });
      }
    } catch (e) {
      console.error("Import failed", e);
      alert("Import failed (see console)");
    }
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search VaultForge..." className="flex-1 p-2 rounded border" />
        <select value={type} onChange={e => setType(e.target.value)} className="p-2 rounded border">
          <option value="all">All</option>
          <option value="spells">Spells</option>
          <option value="classes">Classes</option>
          <option value="races">Races</option>
          <option value="feats">Feats</option>
          <option value="backgrounds">Backgrounds</option>
          <option value="items">Items</option>
        </select>
        <button onClick={runSearch} className="px-3 py-1 bg-indigo-600 text-white rounded" disabled={querying}>{querying ? "Searching..." : "Search"}</button>
      </div>

      <div className="space-y-2">
        {results.map((r: any, i: number) => (
          <div key={i} className="flex items-center justify-between p-2 bg-gray-100 rounded">
            <div>
              <div className="font-semibold">{r.name ?? r.uid}</div>
              <div className="text-xs text-gray-600">{r.type ?? r.category ?? ""} {r.source ? `— ${r.source}` : ""}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-2 py-1 bg-green-600 text-white rounded" onClick={() => importUid(r)}>Import</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


