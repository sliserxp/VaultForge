/* ---------- Helpers ---------- */
export function stripTags(text: string): string {
  return text.replace(/\{@[^} ]+ ([^}]+)\}/g, "$1");
}

export function flattenEntries(entries: any[]): string {
  const result: string[] = [];
  for (const e of entries || []) {
    if (typeof e === "string") result.push(stripTags(e));
    else if (typeof e === "object" && e.entries) result.push(flattenEntries(e.entries));
    else if (e?.name) result.push(stripTags(e.name));
  }
  return result.join(" ");
}

/* ---------- Strength Evaluation ---------- */
export function scoreEntry(entry: any): number {
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

/* ---------- Requirements ---------- */
export function buildRequirements(raw: any, kind: string): string | null {
  const reqs: string[] = [];

  // Feats
  if (kind === "Feat" && raw.prerequisite) {
    for (const req of raw.prerequisite) {
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

  // Class Features
  if (kind === "ClassFeature") {
    if (raw.class) reqs.push(`${raw.class} level ${raw.level || 1}+`);
    if (raw.subclass) reqs.push(`${raw.subclass} subclass, level ${raw.level || 1}+`);
  }

  // Spells
  if (kind === "Spell") {
    if (raw.level !== undefined) reqs.push(`Spell level ${raw.level}`);
    if (raw.classes) {
      const names = raw.classes.map((c: any) => (c.name ? c.name : c));
      reqs.push("Available to: " + names.join(", "));
    }
  }

  // Items
  if (raw.reqAttune) reqs.push("Attunement: " + raw.reqAttune);

  return reqs.length ? reqs.join("; ") : null;
}

/* ---------- Normalizers ---------- */
export function normalizeItem(raw: any) {
  const item: any = {
    name: raw.name,
    type: raw.type || "Gear",
    rarity: raw.rarity || "Common",
    attunement: raw.reqAttune ?? null,
    weight: raw.weight ?? null,
    source: raw.source || "Unknown",
    description: flattenEntries(raw.entries || []),
    requirements: buildRequirements(raw, "Item"),
  };
  item.strength = scoreEntry(item);
  item.value = raw.value ? Number(raw.value) / 100 : item.strength * 100;
  return item;
}

export function normalizeFeat(raw: any) {
  const feat: any = {
    name: raw.name,
    type: "Feat",
    rarity: "Common",
    source: raw.source || "Unknown",
    description: flattenEntries(raw.entries || []),
    requirements: buildRequirements(raw, "Feat"),
  };
  feat.strength = scoreEntry(feat);
  feat.value = feat.strength * 100;
  return feat;
}

export function normalizeSpell(raw: any) {
  const spell: any = {
    name: raw.name,
    type: "Spell",
    rarity: "Common",
    level: raw.level ?? null,
    school: raw.school || "Unknown",
    source: raw.source || "Unknown",
    description: flattenEntries(
      Array.isArray(raw.entries)
        ? raw.entries
        : Array.isArray(raw.desc)
        ? raw.desc
        : []
    ),
    requirements: buildRequirements(raw, "Spell"),
  };
  spell.strength = scoreEntry(spell);
  spell.value = spell.strength * 50;
  return spell;
}

export function normalizeClassFeature(raw: any) {
  const cf: any = {
    name: raw.name,
    type: "ClassFeature",
    rarity: "Common",
    source: raw.source || "Unknown",
    description: flattenEntries(raw.entries || []),
    requirements: buildRequirements(raw, "ClassFeature"),
  };
  cf.strength = scoreEntry(cf);
  cf.value = cf.strength * 75;
  return cf;
}

export function normalizeMonsterTrait(raw: any) {
  const trait: any = {
    name: raw.name,
    type: "MonsterTrait",
    rarity: "Common",
    source: raw.source || "Unknown",
    description: flattenEntries(raw.entries || []),
  };
  trait.strength = scoreEntry(trait);
  trait.value = trait.strength * 50;
  return trait;
}

/* ---------- Universal Normalizer ---------- */
export function normalizeAny(raw: any) {
  if (!raw || !raw.name) return null;

  // Detect type heuristically
  if (raw.rarity || raw.reqAttune || raw.weight !== undefined) {
    return normalizeItem(raw);
  } else if (raw.prerequisite) {
    return normalizeFeat(raw);
  } else if (raw.level !== undefined && raw.school) {
    return normalizeSpell(raw);
  } else if (raw.class || raw.subclass) {
    return normalizeClassFeature(raw);
  } else if (raw.entries && !raw.rarity && !raw.level) {
    return normalizeMonsterTrait(raw);
  }

  // Fallback
  const generic: any = {
    name: raw.name,
    type: "Unknown",
    rarity: "Common",
    source: raw.source || "Unknown",
    description: flattenEntries(raw.entries || []),
  };
  generic.strength = scoreEntry(generic);
  generic.value = generic.strength * 50;
  return generic;
}

