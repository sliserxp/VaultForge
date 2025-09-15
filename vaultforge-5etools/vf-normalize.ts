// vaultforge-5etools/vf-normalize.ts
// Normalization helpers extracted from main.ts to slim down the main plugin.

function stripTags(text: string): string {
  return text.replace(/\{@[^} ]+ ([^}]+)\}/g, "$1");
}

function flattenEntries(entries: any[]): string {
  const result: string[] = [];
  for (const e of entries || []) {
    if (typeof e === "string") result.push(stripTags(e));
    else if (typeof e === "object" && e.entries) result.push(flattenEntries(e.entries));
    else if (e?.name) result.push(stripTags(e.name));
  }
  return result.join(" ");
}

function scoreEntry(entry: any): number {
  let score = 0;
  const rarityMap: Record<string, number> = {
    common: 5,
    uncommon: 15,
    rare: 30,
    "very rare": 50,
    legendary: 75,
    artifact: 90,
  };
  score += rarityMap[(entry.rarity || "").toLowerCase()] || 0;

  const desc = (entry.description || "").toLowerCase();
  if (desc.includes("+1 to attack")) score += 10;
  if (desc.includes("+2 to attack")) score += 20;
  if (desc.includes("resistance")) score += 8;
  if (desc.includes("immune")) score += 20;
  if (desc.includes("flight") || desc.includes("fly speed")) score += 15;
  if (desc.includes("invisible")) score += 15;
  if (desc.includes("teleport")) score += 15;
  if (desc.includes("advantage")) score += 5;
  if (desc.includes("at will")) score += 10;

  return Math.max(1, Math.min(score, 100));
}

function buildRequirements(raw: any, kind: string): string | null {
  const reqs: string[] = [];

  if (kind === "Feat" && raw.prerequisite) {
    const prereqs = Array.isArray(raw.prerequisite) ? raw.prerequisite : [raw.prerequisite];
    for (const req of prereqs) {
      if (!req) continue;
      if (req.ability) {
        for (const ab of req.ability) {
          for (const ability in ab) {
            reqs.push(`${ability.toUpperCase()} ${ab[ability]}+`);
          }
        }
      }
      if (req.race) {
        const races = Array.isArray(req.race) ? req.race : [req.race];
        const names = races.map((r: any) =>
          typeof r === "string" ? r : `${r.name}${r.subrace ? " (" + r.subrace + ")" : ""}`
        );
        reqs.push("Race: " + names.join(", "));
      }
      if (req.feat) reqs.push("Feat: " + req.feat);
      if (req.class) reqs.push(`${req.class.name} level ${req.class.level || 1}+`);
    }
  }

  if (kind === "ClassFeature") {
    if (raw.class) reqs.push(`${raw.class} level ${raw.level || 1}+`);
    if (raw.subclass) reqs.push(`${raw.subclass} subclass, level ${raw.level || 1}+`);
  }

  if (kind === "Spell") {
    if (raw.level !== undefined) reqs.push(`Spell level ${raw.level}`);
    if (raw.classes) {
      const names = raw.classes.map((c: any) => (c.name ? c.name : c));
      reqs.push("Available to: " + names.join(", "));
    }
  }

  if (raw.reqAttune) reqs.push("Attunement: " + raw.reqAttune);

  return reqs.length ? reqs.join("; ") : null;
}

export function normalizeAny(raw: any) {
  if (!raw || !raw.name) return null;

  let kind = "Unknown";
  if (raw.rarity || raw.reqAttune || raw.weight !== undefined) {
    kind = "Item";
  } else if (raw.prerequisite) {
    kind = "Feat";
  } else if (raw.level !== undefined && raw.school) {
    kind = "Spell";
  } else if (raw.class || raw.subclass) {
    kind = "ClassFeature";
  } else if (raw.entries && !raw.rarity && !raw.level) {
    kind = "MonsterTrait";
  }

  const normalized: any = {
    raw,
    name: raw.name,
    type: kind,
    rarity: raw.rarity || "Common",
    source: raw.source || "Unknown",
    description: flattenEntries(
      Array.isArray(raw.entries)
        ? raw.entries
        : Array.isArray(raw.desc)
        ? raw.desc
        : []
    ),
    requirements: buildRequirements(raw, kind),
    weight: raw.weight ?? null,
    attunement: raw.reqAttune ?? null,
    level: raw.level ?? null,
    school: raw.school ?? null,
    // Tags for categorization/search (prefer explicit tags, fall back to type/subtype)
    tags: (() => {
      const t = raw.tags ?? raw.type ?? raw.subtype ?? [];
      return Array.isArray(t) ? t : [t];
    })(),
  };

  normalized.strength = scoreEntry(normalized);
  if (kind === "Item") {
    normalized.value = raw.value ? Number(raw.value) / 100 : normalized.strength * 100;
  } else if (kind === "Spell") {
    normalized.value = normalized.strength * 50;
  } else if (kind === "ClassFeature") {
    normalized.value = normalized.strength * 75;
  } else {
    normalized.value = normalized.strength * 50;
  }

  // Uniform race-specific fields (if present on raw)
  if (raw.creatureTypes) {
    normalized.creature_type = Array.isArray(raw.creatureTypes)
      ? raw.creatureTypes.join(", ")
      : String(raw.creatureTypes);
  }
  if (raw.size) {
    normalized.size = Array.isArray(raw.size) ? raw.size.join(", ") : String(raw.size);
  }
  if (raw.speed !== undefined) {
    // store simple representation (numbers or object)
    normalized.speed =
      typeof raw.speed === "number"
        ? String(raw.speed)
        : typeof raw.speed === "object"
        ? (() => {
            const p: string[] = [];
            if (raw.speed.walk) p.push(`walk:${raw.speed.walk}`);
            if (raw.speed.fly) p.push(`fly:${raw.speed.fly}`);
            if (raw.speed.swim) p.push(`swim:${raw.speed.swim}`);
            // fallback to JSON if nothing parsed
            return p.length ? p.join(", ") : JSON.stringify(raw.speed);
          })()
        : String(raw.speed);
  }

  // Extract trait names from traitTags and entries and expose as traits array + trait1..traitN
  const entryNames: string[] = Array.isArray(raw.entries)
    ? raw.entries.map((e: any) => (e && typeof e === "object" && e.name ? String(e.name) : (typeof e === "string" ? stripTags(e) : null))).filter(Boolean)
    : [];
  const traitTags = Array.isArray(raw.traitTags) ? raw.traitTags.map(String) : [];
  const traits = Array.from(new Set([...traitTags, ...entryNames])).filter(Boolean);
  if (traits.length) {
    normalized.traits = traits;
    traits.forEach((t, i) => {
      normalized[`trait${i + 1}`] = t;
    });
  }

  // For race-like entries, expose a 'race' field matching the name so searches can match 'race: X'
  // Also set for rows coming from the 'races' table (buildDatabase marks raw.__table)
  if (raw.__table === "races" || raw.creatureTypes || raw.traitTags || raw.size) {
    normalized.race = raw.name;
  }

  // For class entries, expose a 'class' field so downstream apps can detect class rows
  if (raw.__table === "classes" || raw.class || raw.subclasses || raw.subclass) {
    normalized.class = raw.name;
  }

  // Build a cached search blob (__search) from common fields so searches are fast and consistent.
  try {
    const searchFields = [
      "name","description","desc","entries","source","creature_type","size","speed",
      "traits","traitTags","tags","race","subrace","subraces","subclass","subclasses",
      "requirements","school","level","classes","type","rarity","weight","attunement",
    ];
    const fieldToStringLocal = (val: any): string => {
      if (val === null || val === undefined) return "";
      if (typeof val === "string") return val;
      if (typeof val === "number" || typeof val === "boolean") return String(val);
      if (Array.isArray(val)) return val.map(v => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    };
    const normalizeToken = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const parts: string[] = [];
    for (const f of searchFields) {
      let v = (normalized as any)[f];
      if (v === undefined && raw) v = raw[f];
      if (v === undefined) continue;
      const str = fieldToStringLocal(v);
      if (str) parts.push(str);
    }
    normalized.__search = normalizeToken(parts.join(" "));
  } catch (e) {
    // ignore search blob errors
    normalized.__search = "";
  }

  return normalized;
}

export function ensureNormalized(entry: any) {
  if (!entry) return entry;
  // If entry already has a computed strength, assume it's normalized
  if (entry.strength !== undefined && entry.uid) return entry;
  // Try to normalize from raw if available, otherwise from the entry itself
  const raw = entry.raw ?? entry;
  const norm = normalizeAny(raw);
  if (norm) {
    // Copy normalized fields back onto the original object reference
    for (const k of Object.keys(norm)) {
      (entry as any)[k] = norm[k];
    }
    return entry;
  }
  return entry;
}

// Merge two raw objects from different files into a single combined raw representation.
// Rules:
// - Scalars: prefer b over a when present (b is newer), otherwise keep a
// - Arrays: concatenate and dedupe by item identity (favor name when available)
// - Objects: shallow/recursive merge; special-case certain keys (entries/desc, speed)
export function deepMergeRaw(a: any, b: any): any {
  const keyFor = (x: any) => {
    if (x === null || x === undefined) return String(x);
    if (typeof x === 'object' && x.name) return String(x.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (typeof x === 'string') return x.toLowerCase().replace(/[^a-z0-9]/g, '');
    try { return JSON.stringify(x); } catch (e) { return String(x); }
  };

  const ensureArray = (v: any) => {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return [v];
    return [v];
  };

  const mergeEntries = (left: any, right: any) => {
    // Convert desc/entries/description into an entries array of strings/objects
    const arrA = Array.isArray(left) ? left : (left ? (typeof left === 'string' ? [left] : (left.entries ?? [left])) : []);
    const arrB = Array.isArray(right) ? right : (right ? (typeof right === 'string' ? [right] : (right.entries ?? [right])) : []);
    const map = new Map<string, any>();
    for (const item of [...arrA, ...arrB]) {
      const key = keyFor((item && (item.name ?? item)) ?? item);
      if (!map.has(key)) map.set(key, item);
    }
    return Array.from(map.values());
  };

  const mergeSpeed = (sA: any, sB: any) => {
    if (!sA) return JSON.parse(JSON.stringify(sB));
    if (!sB) return JSON.parse(JSON.stringify(sA));
    // If either is a number, prefer the numeric (as string) from B
    if (typeof sA === 'number' || typeof sB === 'number') return String(sB ?? sA);
    if (typeof sA === 'string' || typeof sB === 'string') {
      // prefer the more descriptive string (longer)
      return (String(sB).length >= String(sA).length) ? sB : sA;
    }
    // both objects: merge keys and prefer b's values
    const out: any = Object.assign({}, sA);
    for (const k of Object.keys(sB)) {
      out[k] = sB[k];
    }
    return out;
  };

  if (!a) return JSON.parse(JSON.stringify(b));
  if (!b) return JSON.parse(JSON.stringify(a));
  const out: any = Array.isArray(a) ? [...a] : Object.assign({}, a);

  for (const k of Object.keys(b)) {
    const av = out[k];
    const bv = b[k];
    if (bv === undefined) continue;
    if (av === undefined) {
      out[k] = JSON.parse(JSON.stringify(bv));
      continue;
    }

    if (k === 'entries' || k === 'desc' || k === 'description') {
      // Normalize into a combined entries array
      out['entries'] = mergeEntries(av, bv);
      continue;
    }

    if (k === 'speed') {
      out['speed'] = mergeSpeed(av, bv);
      continue;
    }

    // Ensure subraces/subclasses arrays are concatenated/deduped
    if (k === 'subraces' || k === 'subrace' || k === 'subclasses' || k === 'subclass') {
      const arr = [...ensureArray(av), ...ensureArray(bv)];
      const map = new Map<string, any>();
      for (const item of arr) {
        const key = keyFor(item);
        if (!map.has(key)) map.set(key, item);
      }
      out[k] = Array.from(map.values());
      continue;
    }

    // Both defined: handle generically by type
    if (Array.isArray(av) || Array.isArray(bv)) {
      const arrA = Array.isArray(av) ? av : [av];
      const arrB = Array.isArray(bv) ? bv : [bv];
      const map = new Map<string, any>();
      for (const item of [...arrA, ...arrB]) {
        const key = keyFor(item);
        if (!map.has(key)) map.set(key, item);
      }
      out[k] = Array.from(map.values());
    } else if (typeof av === 'object' && typeof bv === 'object') {
      out[k] = deepMergeRaw(av, bv);
    } else {
      // scalar: prefer b
      out[k] = bv;
    }
  }
  return out;
}
