// vaultforge-5etools/vf-class-export.ts
// Helper to build normalized class export map (full extraction of features and spellcasting)

export function makeClassExportMap(fileOrClass: any, subclassesArg?: any[]) {
  // Accept either a full file object ({ class: [...], subclass: [...] }) or a single class entry
  const files = fileOrClass && fileOrClass.class ? fileOrClass : null;
  const classes = files ? files.class || [] : (Array.isArray(fileOrClass) ? fileOrClass : [fileOrClass]);
  const allSubclasses = files ? files.subclass || [] : (subclassesArg || []);

  const normalizeKey = (name: string, source?: string) => `${(name||"").toLowerCase().replace(/\s+/g, "-")}|${(source||"").toLowerCase()}`;

  const result: Record<string, any> = {};

  const ensureLevel = (levelsObj: any, lvl: number) => {
    const k = String(lvl);
    if (!levelsObj[k]) levelsObj[k] = { features: [], spellSlots: {}, spellsKnown: 0, spellcasting: null, spells: [] };
    return levelsObj[k];
  };

  for (const cls of classes) {
    const key = normalizeKey(cls.name, cls.source);
    const hd = (cls.hd && { number: cls.hd.number, faces: cls.hd.faces }) || { number: 1, faces: 10 };
    const baseLevels: Record<string, any> = {};

    // parse classFeatures (strings and objects)
    for (const f of cls.classFeatures || []) {
      if (typeof f === "string") {
        const parts = f.split("|");
        const name = parts[0] || f;
        const src = parts[2] || cls.source;
        const lvl = Number(parts[3] || parts[4] || 1);
        const bucket = ensureLevel(baseLevels, lvl);
        bucket.features.push({ name, source: src, level: lvl });
      } else if (f && typeof f === "object") {
        const raw = f.classFeature || f.classfeature;
        if (typeof raw === "string") {
          const parts = raw.split("|");
          const name = parts[0] || raw;
          const src = parts[2] || cls.source;
          const lvl = Number(parts[3] || 1);
          const bucket = ensureLevel(baseLevels, lvl);
          bucket.features.push({ name, source: src, level: lvl, gainSubclassFeature: !!f.gainSubclassFeature });
        } else {
          const lvl = Number(f.level || 1);
          const bucket = ensureLevel(baseLevels, lvl);
          bucket.features.push({ raw: f, level: lvl });
        }
      }
    }

    // parse detailed classFeature array
    for (const cf of cls.classFeature || []) {
      const lvl = Number(cf.level || 1);
      const bucket = ensureLevel(baseLevels, lvl);
      bucket.features.push({ name: cf.name, source: cf.source, level: lvl, entries: cf.entries });
    }

    // Build result entry for class
    result[key] = { hd, levels: baseLevels, subclasses: {} };

    // collect subclasses that belong to this class
    const mySubs = allSubclasses.filter((s: any) => (s.className === cls.name) || (s.className === cls.name && s.classSource === cls.source) || s.className === cls.name);

    for (const sc of mySubs) {
      const sk = normalizeKey(sc.name || sc.shortName || sc.subclassShortName || "subclass", sc.source);
      const scHd = sc.hd ? { number: sc.hd.number, faces: sc.hd.faces } : hd;
      const scLevels: Record<string, any> = {};

      // helper to write spellcasting metadata into a level bucket
      const writeSpellcastingToLevel = (lvlIdx: number, data: any) => {
        const bucket = ensureLevel(scLevels, lvlIdx);
        bucket.spellcasting = Object.assign({}, bucket.spellcasting || {}, data);
      };

      // 1) direct progression arrays
      if (sc.cantripProgression) {
        sc.cantripProgression.forEach((c: any, idx: number) => {
          writeSpellcastingToLevel(idx + 1, { cantripsKnown: c });
        });
      }
      if (sc.spellsKnownProgression) {
        sc.spellsKnownProgression.forEach((c: any, idx: number) => {
          writeSpellcastingToLevel(idx + 1, { spellsKnown: c });
        });
      }
      if (sc.preparedSpellsProgression) {
        sc.preparedSpellsProgression.forEach((c: any, idx: number) => {
          writeSpellcastingToLevel(idx + 1, { spellsKnown: c, prepared: true });
        });
      }
      if (sc.spellcastingAbility) {
        // annotate ability on all levels where we have something, or store as metadata on 1
        writeSpellcastingToLevel(1, { ability: sc.spellcastingAbility, casterProgression: sc.casterProgression || sc.casterProgression });
      }

      // 2) additionalSpells entries (expanded mapping)
      if (sc.additionalSpells) {
        for (const add of sc.additionalSpells) {
          if (add.expanded) {
            for (const lvlStr of Object.keys(add.expanded)) {
              const lvl = Number(lvlStr);
              const bucket = ensureLevel(scLevels, lvl);
              bucket.spells = bucket.spells || [];
              bucket.spells.push({ expanded: add.expanded[lvlStr] });
            }
          }
          if (add.known) {
            for (const lvlStr of Object.keys(add.known)) {
              const lvl = Number(lvlStr);
              const bucket = ensureLevel(scLevels, lvl);
              bucket.spells = bucket.spells || [];
              bucket.spells.push({ known: add.known[lvlStr] });
            }
          }
          if (add.innate) {
            for (const lvlStr of Object.keys(add.innate)) {
              const lvl = Number(lvlStr);
              const bucket = ensureLevel(scLevels, lvl);
              bucket.spells = bucket.spells || [];
              bucket.spells.push({ innate: add.innate[lvlStr] });
            }
          }
        }
      }

      // 3) subclassTableGroups: rowsSpellProgression (spell slots) and rows (cantrips/spells known)
      for (const g of sc.subclassTableGroups || []) {
        if (g.rowsSpellProgression) {
          // rowsSpellProgression: array of rows (per class level) where each row is array of slot counts per spell-level
          g.rowsSpellProgression.forEach((row: any[], rowIdx: number) => {
            const lvl = rowIdx + 1;
            const bucket = ensureLevel(scLevels, lvl);
            bucket.spellSlots = bucket.spellSlots || {};
            row.forEach((count: any, idx: number) => {
              const spellLevel = idx + 1; // first column = 1st-level spells
              const n = Number(count || 0);
              if (n > 0) bucket.spellSlots[String(spellLevel)] = n;
            });
          });
        }

        // generic rows mapping (e.g., cantrips known / spells known per level)
        if (g.rows && g.colLabels && Array.isArray(g.colLabels)) {
          // Inspect colLabels to find which columns map to cantrips or spells known/prepared
          const mappings: Record<number, string> = {};
          g.colLabels.forEach((label: string, colIdx: number) => {
            const lower = String(label).toLowerCase();
            if (lower.includes("cantrips")) mappings[colIdx] = "cantripsKnown";
            else if (lower.includes("spells known") || lower.includes("spellsknown") || lower.includes("spells prepared") || lower.includes("spells prepared")) mappings[colIdx] = "spellsKnown";
          });
          if (Object.keys(mappings).length) {
            g.rows.forEach((row: any[], rowIdx: number) => {
              const lvl = rowIdx + 1;
              const bucket = ensureLevel(scLevels, lvl);
              Object.entries(mappings).forEach(([colStr, prop]) => {
                const col = Number(colStr);
                const val = row[col];
                if (prop === "cantripsKnown") bucket.spellcasting = Object.assign({}, bucket.spellcasting || {}, { cantripsKnown: val });
                if (prop === "spellsKnown") bucket.spellcasting = Object.assign({}, bucket.spellcasting || {}, { spellsKnown: val });
              });
            });
          }
        }
      }

      // 4) Fallback: casterProgression string like "1/3" - annotate metadata on levels that exist
      if (sc.casterProgression && !Object.keys(scLevels).length) {
        // annotate progression on level 1 as metadata
        writeSpellcastingToLevel(1, { casterProgression: sc.casterProgression });
      }

      result[key].subclasses[sk] = { hd: scHd, levels: scLevels };

      // Merge subclass spellcasting & spells into base class levels automatically
      for (const lvlStr of Object.keys(scLevels)) {
        const lvl = Number(lvlStr);
        const baseBucket = ensureLevel(result[key].levels, lvl);
        const scBucket = scLevels[lvlStr];
        // merge spellSlots (subclass slots override/augment base)
        baseBucket.spellSlots = Object.assign({}, baseBucket.spellSlots || {}, scBucket.spellSlots || {});
        // merge spells array
        if (scBucket.spells && scBucket.spells.length) {
          baseBucket.spells = (baseBucket.spells || []).concat(scBucket.spells);
        }
        // preserve subclass-specific spellcasting under a per-level map to avoid clobbering
        baseBucket.subclassSpellcasting = baseBucket.subclassSpellcasting || {};
        baseBucket.subclassSpellcasting[sk] = Object.assign({}, baseBucket.subclassSpellcasting[sk] || {}, scBucket.spellcasting || {});
        // merge simple spellcasting fields where appropriate
        if (scBucket.spellcasting) {
          baseBucket.spellcasting = baseBucket.spellcasting || {};
          if (scBucket.spellcasting.ability) baseBucket.spellcasting.ability = baseBucket.spellcasting.ability || scBucket.spellcasting.ability;
          if (scBucket.spellcasting.casterProgression) baseBucket.spellcasting.casterProgression = baseBucket.spellcasting.casterProgression || scBucket.spellcasting.casterProgression;
          if (scBucket.spellcasting.cantripsKnown != null) baseBucket.spellcasting.cantripsKnown = baseBucket.spellcasting.cantripsKnown != null ? baseBucket.spellcasting.cantripsKnown : scBucket.spellcasting.cantripsKnown;
          if (scBucket.spellcasting.spellsKnown != null) baseBucket.spellcasting.spellsKnown = baseBucket.spellcasting.spellsKnown != null ? baseBucket.spellcasting.spellsKnown : scBucket.spellcasting.spellsKnown;
        }
        // also merge top-level spellsKnown if present on scBucket
        if (scBucket.spellsKnown) {
          baseBucket.spellsKnown = baseBucket.spellsKnown || scBucket.spellsKnown;
        }
      }
    }

    // end class loop
  }

  return result;
}
