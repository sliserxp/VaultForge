"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// vf-class-export.ts
var vf_class_export_exports = {};
__export(vf_class_export_exports, {
  makeClassExportMap: () => makeClassExportMap
});
function makeClassExportMap(fileOrClass, subclassesArg) {
  const files = fileOrClass && fileOrClass.class ? fileOrClass : null;
  const classes = files ? files.class || [] : Array.isArray(fileOrClass) ? fileOrClass : [fileOrClass];
  const allSubclasses = files ? files.subclass || [] : subclassesArg || [];
  const normalizeKey = (name, source) => `${(name || "").toLowerCase().replace(/\s+/g, "-")}|${(source || "").toLowerCase()}`;
  const result = {};
  const ensureLevel = (levelsObj, lvl) => {
    const k = String(lvl);
    if (!levelsObj[k]) levelsObj[k] = { features: [], spellSlots: {}, spellsKnown: 0, spellcasting: null, spells: [] };
    return levelsObj[k];
  };
  for (const cls of classes) {
    const key = normalizeKey(cls.name, cls.source);
    const hd = cls.hd && { number: cls.hd.number, faces: cls.hd.faces } || { number: 1, faces: 10 };
    const baseLevels = {};
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
    for (const cf of cls.classFeature || []) {
      const lvl = Number(cf.level || 1);
      const bucket = ensureLevel(baseLevels, lvl);
      bucket.features.push({ name: cf.name, source: cf.source, level: lvl, entries: cf.entries });
    }
    result[key] = { hd, levels: baseLevels, subclasses: {} };
    const mySubs = allSubclasses.filter((s) => s.className === cls.name || s.className === cls.name && s.classSource === cls.source || s.className === cls.name);
    for (const sc of mySubs) {
      const sk = normalizeKey(sc.name || sc.shortName || sc.subclassShortName || "subclass", sc.source);
      const scHd = sc.hd ? { number: sc.hd.number, faces: sc.hd.faces } : hd;
      const scLevels = {};
      const writeSpellcastingToLevel = (lvlIdx, data) => {
        const bucket = ensureLevel(scLevels, lvlIdx);
        bucket.spellcasting = Object.assign({}, bucket.spellcasting || {}, data);
      };
      if (sc.cantripProgression) {
        sc.cantripProgression.forEach((c, idx) => {
          writeSpellcastingToLevel(idx + 1, { cantripsKnown: c });
        });
      }
      if (sc.spellsKnownProgression) {
        sc.spellsKnownProgression.forEach((c, idx) => {
          writeSpellcastingToLevel(idx + 1, { spellsKnown: c });
        });
      }
      if (sc.preparedSpellsProgression) {
        sc.preparedSpellsProgression.forEach((c, idx) => {
          writeSpellcastingToLevel(idx + 1, { spellsKnown: c, prepared: true });
        });
      }
      if (sc.spellcastingAbility) {
        writeSpellcastingToLevel(1, { ability: sc.spellcastingAbility, casterProgression: sc.casterProgression || sc.casterProgression });
      }
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
      for (const g of sc.subclassTableGroups || []) {
        if (g.rowsSpellProgression) {
          g.rowsSpellProgression.forEach((row, rowIdx) => {
            const lvl = rowIdx + 1;
            const bucket = ensureLevel(scLevels, lvl);
            bucket.spellSlots = bucket.spellSlots || {};
            row.forEach((count, idx) => {
              const spellLevel = idx + 1;
              const n = Number(count || 0);
              if (n > 0) bucket.spellSlots[String(spellLevel)] = n;
            });
          });
        }
        if (g.rows && g.colLabels && Array.isArray(g.colLabels)) {
          const mappings = {};
          g.colLabels.forEach((label, colIdx) => {
            const lower = String(label).toLowerCase();
            if (lower.includes("cantrips")) mappings[colIdx] = "cantripsKnown";
            else if (lower.includes("spells known") || lower.includes("spellsknown") || lower.includes("spells prepared") || lower.includes("spells prepared")) mappings[colIdx] = "spellsKnown";
          });
          if (Object.keys(mappings).length) {
            g.rows.forEach((row, rowIdx) => {
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
      if (sc.casterProgression && !Object.keys(scLevels).length) {
        writeSpellcastingToLevel(1, { casterProgression: sc.casterProgression });
      }
      result[key].subclasses[sk] = { hd: scHd, levels: scLevels };
      for (const lvlStr of Object.keys(scLevels)) {
        const lvl = Number(lvlStr);
        const baseBucket = ensureLevel(result[key].levels, lvl);
        const scBucket = scLevels[lvlStr];
        baseBucket.spellSlots = Object.assign({}, baseBucket.spellSlots || {}, scBucket.spellSlots || {});
        if (scBucket.spells && scBucket.spells.length) {
          baseBucket.spells = (baseBucket.spells || []).concat(scBucket.spells);
        }
        baseBucket.subclassSpellcasting = baseBucket.subclassSpellcasting || {};
        baseBucket.subclassSpellcasting[sk] = Object.assign({}, baseBucket.subclassSpellcasting[sk] || {}, scBucket.spellcasting || {});
        if (scBucket.spellcasting) {
          baseBucket.spellcasting = baseBucket.spellcasting || {};
          if (scBucket.spellcasting.ability) baseBucket.spellcasting.ability = baseBucket.spellcasting.ability || scBucket.spellcasting.ability;
          if (scBucket.spellcasting.casterProgression) baseBucket.spellcasting.casterProgression = baseBucket.spellcasting.casterProgression || scBucket.spellcasting.casterProgression;
          if (scBucket.spellcasting.cantripsKnown != null) baseBucket.spellcasting.cantripsKnown = baseBucket.spellcasting.cantripsKnown != null ? baseBucket.spellcasting.cantripsKnown : scBucket.spellcasting.cantripsKnown;
          if (scBucket.spellcasting.spellsKnown != null) baseBucket.spellcasting.spellsKnown = baseBucket.spellcasting.spellsKnown != null ? baseBucket.spellcasting.spellsKnown : scBucket.spellcasting.spellsKnown;
        }
        if (scBucket.spellsKnown) {
          baseBucket.spellsKnown = baseBucket.spellsKnown || scBucket.spellsKnown;
        }
      }
    }
  }
  return result;
}
var init_vf_class_export = __esm({
  "vf-class-export.ts"() {
    "use strict";
  }
});

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VaultForge5eTools,
  fileMode: () => fileMode
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// vf-normalize.ts
function stripTags(text) {
  return text.replace(/\{@[^} ]+ ([^}]+)\}/g, "$1");
}
function flattenEntries(entries) {
  const result = [];
  for (const e of entries || []) {
    if (typeof e === "string") result.push(stripTags(e));
    else if (typeof e === "object" && e.entries) result.push(flattenEntries(e.entries));
    else if (e?.name) result.push(stripTags(e.name));
  }
  return result.join(" ");
}
function scoreEntry(entry) {
  let score = 0;
  const rarityMap = {
    common: 5,
    uncommon: 15,
    rare: 30,
    "very rare": 50,
    legendary: 75,
    artifact: 90
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
function buildRequirements(raw, kind) {
  const reqs = [];
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
        const names = races.map(
          (r) => typeof r === "string" ? r : `${r.name}${r.subrace ? " (" + r.subrace + ")" : ""}`
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
    if (raw.level !== void 0) reqs.push(`Spell level ${raw.level}`);
    if (raw.classes) {
      const names = raw.classes.map((c) => c.name ? c.name : c);
      reqs.push("Available to: " + names.join(", "));
    }
  }
  if (raw.reqAttune) reqs.push("Attunement: " + raw.reqAttune);
  return reqs.length ? reqs.join("; ") : null;
}
function normalizeAny(raw) {
  if (!raw || !raw.name) return null;
  let kind = "Unknown";
  if (raw.rarity || raw.reqAttune || raw.weight !== void 0) {
    kind = "Item";
  } else if (raw.prerequisite) {
    kind = "Feat";
  } else if (raw.level !== void 0 && raw.school) {
    kind = "Spell";
  } else if (raw.class || raw.subclass) {
    kind = "ClassFeature";
  } else if (raw.entries && !raw.rarity && !raw.level) {
    kind = "MonsterTrait";
  }
  const normalized = {
    raw,
    name: raw.name,
    type: kind,
    rarity: raw.rarity || "Common",
    source: raw.source || "Unknown",
    description: flattenEntries(
      Array.isArray(raw.entries) ? raw.entries : Array.isArray(raw.desc) ? raw.desc : []
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
    })()
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
  if (raw.creatureTypes) {
    normalized.creature_type = Array.isArray(raw.creatureTypes) ? raw.creatureTypes.join(", ") : String(raw.creatureTypes);
  }
  if (raw.size) {
    normalized.size = Array.isArray(raw.size) ? raw.size.join(", ") : String(raw.size);
  }
  if (raw.speed !== void 0) {
    normalized.speed = typeof raw.speed === "number" ? String(raw.speed) : typeof raw.speed === "object" ? (() => {
      const p = [];
      if (raw.speed.walk) p.push(`walk:${raw.speed.walk}`);
      if (raw.speed.fly) p.push(`fly:${raw.speed.fly}`);
      if (raw.speed.swim) p.push(`swim:${raw.speed.swim}`);
      return p.length ? p.join(", ") : JSON.stringify(raw.speed);
    })() : String(raw.speed);
  }
  const entryNames = Array.isArray(raw.entries) ? raw.entries.map((e) => e && typeof e === "object" && e.name ? String(e.name) : typeof e === "string" ? stripTags(e) : null).filter(Boolean) : [];
  const traitTags = Array.isArray(raw.traitTags) ? raw.traitTags.map(String) : [];
  const traits = Array.from(/* @__PURE__ */ new Set([...traitTags, ...entryNames])).filter(Boolean);
  if (traits.length) {
    normalized.traits = traits;
    traits.forEach((t, i) => {
      normalized[`trait${i + 1}`] = t;
    });
  }
  if (raw.__table === "races" || raw.creatureTypes || raw.traitTags || raw.size) {
    normalized.race = raw.name;
  }
  if (raw.__table === "classes" || raw.class || raw.subclasses || raw.subclass) {
    normalized.class = raw.name;
  }
  try {
    const searchFields = [
      "name",
      "description",
      "desc",
      "entries",
      "source",
      "creature_type",
      "size",
      "speed",
      "traits",
      "traitTags",
      "tags",
      "race",
      "subrace",
      "subraces",
      "subclass",
      "subclasses",
      "requirements",
      "school",
      "level",
      "classes",
      "type",
      "rarity",
      "weight",
      "attunement"
    ];
    const fieldToStringLocal = (val) => {
      if (val === null || val === void 0) return "";
      if (typeof val === "string") return val;
      if (typeof val === "number" || typeof val === "boolean") return String(val);
      if (Array.isArray(val)) return val.map((v) => typeof v === "string" ? v : JSON.stringify(v)).join(" ");
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    };
    const normalizeToken = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const parts = [];
    for (const f of searchFields) {
      let v = normalized[f];
      if (v === void 0 && raw) v = raw[f];
      if (v === void 0) continue;
      const str = fieldToStringLocal(v);
      if (str) parts.push(str);
    }
    normalized.__search = normalizeToken(parts.join(" "));
  } catch (e) {
    normalized.__search = "";
  }
  return normalized;
}
function ensureNormalized(entry) {
  if (!entry) return entry;
  if (entry.strength !== void 0 && entry.uid) return entry;
  const raw = entry.raw ?? entry;
  const norm = normalizeAny(raw);
  if (norm) {
    for (const k of Object.keys(norm)) {
      entry[k] = norm[k];
    }
    return entry;
  }
  return entry;
}
function deepMergeRaw(a, b) {
  const keyFor = (x) => {
    if (x === null || x === void 0) return String(x);
    if (typeof x === "object" && x.name) return String(x.name).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (typeof x === "string") return x.toLowerCase().replace(/[^a-z0-9]/g, "");
    try {
      return JSON.stringify(x);
    } catch (e) {
      return String(x);
    }
  };
  const ensureArray = (v) => {
    if (v === void 0 || v === null) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return [v];
    return [v];
  };
  const mergeEntries = (left, right) => {
    const arrA = Array.isArray(left) ? left : left ? typeof left === "string" ? [left] : left.entries ?? [left] : [];
    const arrB = Array.isArray(right) ? right : right ? typeof right === "string" ? [right] : right.entries ?? [right] : [];
    const map = /* @__PURE__ */ new Map();
    for (const item of [...arrA, ...arrB]) {
      const key = keyFor((item && (item.name ?? item)) ?? item);
      if (!map.has(key)) map.set(key, item);
    }
    return Array.from(map.values());
  };
  const mergeSpeed = (sA, sB) => {
    if (!sA) return JSON.parse(JSON.stringify(sB));
    if (!sB) return JSON.parse(JSON.stringify(sA));
    if (typeof sA === "number" || typeof sB === "number") return String(sB ?? sA);
    if (typeof sA === "string" || typeof sB === "string") {
      return String(sB).length >= String(sA).length ? sB : sA;
    }
    const out2 = Object.assign({}, sA);
    for (const k of Object.keys(sB)) {
      out2[k] = sB[k];
    }
    return out2;
  };
  if (!a) return JSON.parse(JSON.stringify(b));
  if (!b) return JSON.parse(JSON.stringify(a));
  const out = Array.isArray(a) ? [...a] : Object.assign({}, a);
  for (const k of Object.keys(b)) {
    const av = out[k];
    const bv = b[k];
    if (bv === void 0) continue;
    if (av === void 0) {
      out[k] = JSON.parse(JSON.stringify(bv));
      continue;
    }
    if (k === "entries" || k === "desc" || k === "description") {
      out["entries"] = mergeEntries(av, bv);
      continue;
    }
    if (k === "speed") {
      out["speed"] = mergeSpeed(av, bv);
      continue;
    }
    if (k === "subraces" || k === "subrace" || k === "subclasses" || k === "subclass") {
      const arr = [...ensureArray(av), ...ensureArray(bv)];
      const map = /* @__PURE__ */ new Map();
      for (const item of arr) {
        const key = keyFor(item);
        if (!map.has(key)) map.set(key, item);
      }
      out[k] = Array.from(map.values());
      continue;
    }
    if (Array.isArray(av) || Array.isArray(bv)) {
      const arrA = Array.isArray(av) ? av : [av];
      const arrB = Array.isArray(bv) ? bv : [bv];
      const map = /* @__PURE__ */ new Map();
      for (const item of [...arrA, ...arrB]) {
        const key = keyFor(item);
        if (!map.has(key)) map.set(key, item);
      }
      out[k] = Array.from(map.values());
    } else if (typeof av === "object" && typeof bv === "object") {
      out[k] = deepMergeRaw(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

// vf-maps.ts
var VF_MAPS = {
  // Fields to include in text-search (normalizeName applied). Add any raw/normalized fields you want searchable.
  searchFields: [
    "name",
    "description",
    "desc",
    "entries",
    "source",
    "creature_type",
    "size",
    "speed",
    "traits",
    "traitTags",
    "tags",
    "race",
    "subrace",
    "subraces",
    "subclass",
    "subclasses",
    "requirements",
    "school",
    "level",
    "classes",
    "type",
    "rarity",
    "weight",
    "attunement"
  ],
  // Simple aliases for categories -> folder names inside the 5etools /data folder
  // Keys here should match the 'cats' used in buildMasterIndex where appropriate.
  categoryAliases: {
    monsters: "bestiary",
    bestiary: "bestiary",
    classes: "class",
    class: "class",
    items: "items",
    spells: "spells",
    races: "races",
    backgrounds: "backgrounds",
    feats: "feats",
    vehicles: "vehicles",
    optionalFeatures: "optionalFeatures",
    variantRules: "variantRules",
    conditionsDiseases: "conditionsDiseases",
    traps: "traps",
    hazards: "hazards",
    tables: "tables",
    cults: "cults",
    deities: "deities",
    psionics: "psionics",
    maneuvers: "maneuvers",
    invocations: "invocations",
    adventures: "adventures",
    books: "books",
    languages: "languages",
    skills: "skills",
    loot: "loot",
    generated: "generated"
  },
  // Per-table field suggestions — used to decide which fields to extract/check when searching or building lightweight rows.
  // These are suggestions only; normalizeAny will still create normalized fields (e.g., traits, race) you can reference.
  tableFieldMap: {
    items: ["name", "description", "type", "subtype", "rarity", "weight", "reqAttune", "value", "tags"],
    spells: ["name", "desc", "entries", "level", "school", "classes", "ritual", "concentration"],
    bestiary: ["name", "entries", "description", "size", "challenge", "hitPoints", "creatureTypes", "speed", "traits", "actions", "reactions", "legendaryActions", "legendary"],
    monsters: ["name", "entries", "description", "size", "challenge", "hitPoints", "creatureTypes", "speed", "traits", "actions", "reactions"],
    classes: ["name", "subclasses", "entries", "class", "levelProgression"],
    races: ["name", "traits", "subraces", "size", "speed", "ability", "traitTags"],
    backgrounds: ["name", "entries", "skills", "toolProficiencies"],
    feats: ["name", "entries", "prerequisite", "requirements"],
    optionalFeatures: ["name", "entries", "requirements"],
    variantRules: ["name", "entries"],
    conditionsDiseases: ["name", "entries", "description"],
    traps: ["name", "entries", "level"],
    hazards: ["name", "entries"],
    tables: ["name", "colLabels", "rows"],
    cults: ["name", "entries"],
    deities: ["name", "entries"],
    psionics: ["name", "entries"],
    maneuvers: ["name", "entries"],
    invocations: ["name", "entries"],
    adventures: ["name", "entries", "summary"],
    books: ["name", "entries"],
    languages: ["name", "entries"],
    skills: ["name", "entries"],
    loot: ["name", "entries"],
    generated: ["name", "entries"]
  },
  // Optional: preferred index paths inside /data for faster file selection (the readTableFromData already checks some index.json patterns)
  preferredIndexPaths: {
    spells: "spells/index.json",
    bestiary: "bestiary/index.json",
    class: "class/index.json"
  },
  // classExportMap: normalized className -> {
  //   hd: { number: 1, faces: 10 },
  //   levels: {
  //     1: {
  //       features: [],               // array of feature objects {name, type, source, level, ...}
  //       spellSlots: {},            // e.g. {1: 2, 2: 0, ...}
  //       spellsKnown: 0,            // number (for spontaneous casters)
  //       spellcasting: {            // metadata about spellcasting for this level
  //         type: "full"|"half"|"pact"|"none",
  //         ability: "int"|"wis"|"cha",
  //       },
  //       spells: []                 // explicit spells gained/available at this level
  //     },
  //     // ...
  //   }
  // }
  classExportMap: {},
  makeClassExportEntry: (fileOrClass, subclasses) => {
    const helper = (init_vf_class_export(), __toCommonJS(vf_class_export_exports));
    return helper.makeClassExportMap(fileOrClass, subclasses);
  }
};

// main.ts
var DEFAULT_SETTINGS = {
  dbPath: "5etools.db",
  dataPath: "data",
  lastUpdated: ""
  // checked
};
function pluginPath(plugin, fileName) {
  const vaultPath = plugin.app.vault.adapter.basePath;
  const relDir = plugin.manifest.dir;
  const absDir = path.join(String(vaultPath), String(relDir));
  return fileName ? path.join(absDir, fileName) : absDir;
}
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function safeTableName(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
function walkJsonFiles(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkJsonFiles(fullPath, fileList);
    } else if (entry.endsWith(".json")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}
function resolveTableName(file) {
  const base = path.basename(file, ".json");
  const parent = path.basename(path.dirname(file));
  if (parent === "data") {
    if (base.includes("item")) return "items";
    if (base.includes("spell")) return "spells";
    if (base.includes("bestiary")) return "bestiary";
    if (base.includes("class")) return "classes";
    if (base.includes("adventure")) return "adventure";
    if (base.includes("book")) return "book";
    if (base.includes("race")) return "races";
    return base;
  }
  return parent;
}
async function readTableFromData(dataPath, table) {
  const results = [];
  if (!fs.existsSync(dataPath)) return results;
  const resolved = VF_MAPS.categoryAliases?.[table] ?? (table === "monsters" ? "bestiary" : table);
  const desired = resolved;
  const filesToRead = [];
  try {
    const prefIndex = VF_MAPS.preferredIndexPaths?.[resolved];
    if (prefIndex) {
      const idxPath = path.join(dataPath, prefIndex);
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
        const unique = Array.from(new Set(Object.values(idx)));
        for (const fn of unique) {
          if (String(fn).toLowerCase().includes("foundry")) continue;
          filesToRead.push(path.join(path.dirname(idxPath), String(fn)));
        }
      }
    }
    if (resolved === "spells") {
      const idxPath = path.join(dataPath, "spells", "index.json");
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
        const unique = Array.from(new Set(Object.values(idx)));
        for (const fn of unique) {
          if (String(fn).toLowerCase().includes("foundry")) continue;
          filesToRead.push(path.join(dataPath, "spells", String(fn)));
        }
      }
    }
    if (resolved === "bestiary") {
      const idxPath = path.join(dataPath, "bestiary", "index.json");
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
        const unique = Array.from(new Set(Object.values(idx)));
        for (const fn of unique) {
          if (String(fn).toLowerCase().includes("foundry")) continue;
          filesToRead.push(path.join(dataPath, "bestiary", String(fn)));
        }
      }
    }
    if (resolved === "classes" || resolved === "class") {
      const idxPath = path.join(dataPath, "class", "index.json");
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
        const unique = Array.from(new Set(Object.values(idx)));
        for (const fn of unique) {
          if (String(fn).toLowerCase().includes("foundry")) continue;
          filesToRead.push(path.join(dataPath, "class", String(fn)));
        }
      }
    }
    if (resolved === "items") {
      const candidates = ["items-base.json", "items.json", "fluff-items.json", "items.json"];
      for (const c of candidates) {
        const itemsPath = path.join(dataPath, c);
        if (fs.existsSync(itemsPath) && !path.basename(itemsPath).toLowerCase().startsWith("foundry")) filesToRead.push(itemsPath);
      }
    }
  } catch (e) {
    console.warn("[VaultForge-5eTools] failed to read index file:", e);
  }
  if (!filesToRead.length) {
    const all = walkJsonFiles(dataPath);
    for (const f of all) {
      if (safeTableName(resolveTableName(f)) === desired) {
        const bn = path.basename(f).toLowerCase();
        if (bn.startsWith("foundry") || bn.includes("foundry-") || bn.includes("foundry")) continue;
        filesToRead.push(f);
      }
    }
  }
  const uidMap = {};
  for (const file of filesToRead) {
    try {
      if (!fs.existsSync(file)) continue;
      const rawFile = JSON.parse(fs.readFileSync(file, "utf-8"));
      let rows = [];
      if (desired === "spells") rows = rawFile.spell ?? rawFile.spells ?? (Array.isArray(rawFile) ? rawFile : []);
      else if (desired === "bestiary") rows = rawFile.monster ?? rawFile.monsters ?? (Array.isArray(rawFile) ? rawFile : []);
      else if (desired === "items") rows = rawFile.item ?? rawFile.items ?? (Array.isArray(rawFile) ? rawFile : []);
      else rows = Array.isArray(rawFile) ? rawFile : Object.values(rawFile).find((v) => Array.isArray(v)) || [];
      for (const r of rows) {
        r.__table = desired;
        r.__file = path.relative(dataPath, file);
        const src = r.source || "Unknown";
        const name = r.name || r.title || null;
        if (!name) continue;
        const uid = `${name}|${src}`;
        if (!uidMap[uid]) {
          uidMap[uid] = { raw: JSON.parse(JSON.stringify(r)), files: [path.relative(dataPath, file)] };
        } else {
          uidMap[uid].raw = deepMergeRaw(uidMap[uid].raw, r);
          const rel = path.relative(dataPath, file);
          if (!uidMap[uid].files.includes(rel)) uidMap[uid].files.push(rel);
        }
      }
    } catch (e) {
      console.warn("[VaultForge-5eTools] failed to read file", file, e);
    }
  }
  for (const uid of Object.keys(uidMap)) {
    try {
      const mergedRaw = uidMap[uid].raw;
      mergedRaw.__file = uidMap[uid].files.join(",");
      const norm = normalizeAny(mergedRaw);
      if (!norm) continue;
      norm.uid = uid;
      norm.file = mergedRaw.__file;
      results.push(norm);
      try {
        if (desired === "races" && mergedRaw && mergedRaw.subraces) {
          const srs = Array.isArray(mergedRaw.subraces) ? mergedRaw.subraces : Array.isArray(mergedRaw.subrace) ? mergedRaw.subrace : [];
          for (const sr of srs) {
            const srName = typeof sr === "string" ? sr : sr && sr.name || null;
            const srSource = sr && sr.source || mergedRaw.source || "Unknown";
            if (!srName) continue;
            const rawSub = deepMergeRaw(mergedRaw, Object.assign({}, mergedRaw, { name: srName, source: srSource }));
            rawSub.__file = mergedRaw.__file;
            const normSub = normalizeAny(rawSub);
            if (!normSub) continue;
            normSub.uid = `${normSub.name}|${normSub.source || srSource}`;
            normSub.file = rawSub.__file;
            normSub.parent = norm.name;
            results.push(normSub);
          }
        }
      } catch (e) {
      }
      try {
        if (desired === "classes" && mergedRaw && (mergedRaw.subclasses || mergedRaw.subclass)) {
          const subs = Array.isArray(mergedRaw.subclasses) ? mergedRaw.subclasses : Array.isArray(mergedRaw.subclass) ? mergedRaw.subclass : [];
          for (const sc of subs) {
            const scName = typeof sc === "string" ? sc : sc && (sc.name ?? sc.subclass) || null;
            const scSource = sc && sc.source || mergedRaw.source || "Unknown";
            if (!scName) continue;
            const rawSub = deepMergeRaw(mergedRaw, Object.assign({}, mergedRaw, { name: scName, source: scSource }));
            rawSub.__file = mergedRaw.__file;
            const normSub = normalizeAny(rawSub);
            if (!normSub) continue;
            normSub.uid = `${normSub.name}|${normSub.source || scSource}`;
            normSub.file = rawSub.__file;
            normSub.parent = norm.name;
            results.push(normSub);
          }
        }
      } catch (e) {
      }
    } catch (e) {
      console.warn("[VaultForge-5eTools] failed to normalize merged uid", uid, e);
    }
  }
  return results;
}
async function buildMasterIndex(dataPath, outPath) {
  const cats = ["items", "spells", "classes", "races", "backgrounds", "feats", "monsters", "vehicles", "optionalFeatures", "variantRules", "conditionsDiseases", "traps", "hazards", "tables", "cults", "deities", "psionics", "maneuvers", "invocations", "adventures", "books", "languages", "skills", "loot", "generated"];
  const index = {};
  for (const cat of cats) {
    index[cat] = {};
    const qcat = cat === "monsters" ? "bestiary" : cat === "classes" ? "classes" : cat;
    const rows = await readTableFromData(dataPath, qcat);
    for (const r of rows) {
      if (!r.uid) continue;
      index[cat][r.uid] = { category: qcat === "classes" ? "class" : qcat, file: r.file || "" };
      try {
        if (cat === "classes" && r.raw) {
          const subs = r.raw.subclasses ?? r.raw.subclass ?? null;
          if (Array.isArray(subs)) {
            for (const sc of subs) {
              const scName = typeof sc === "string" ? sc : sc && (sc.name ?? sc.subclass) || null;
              const scSource = sc && sc.source || r.source || "Unknown";
              if (scName) {
                const scUid = `${scName}|${scSource}`;
                index[cat][scUid] = { category: "class", file: r.file || "" };
              }
            }
          }
        }
      } catch (e) {
      }
      try {
        if (cat === "races" && r.raw) {
          const srs = r.raw.subraces ?? r.raw.subrace ?? null;
          if (Array.isArray(srs)) {
            for (const sr of srs) {
              const srName = typeof sr === "string" ? sr : sr && sr.name || null;
              const srSource = sr && sr.source || r.source || "Unknown";
              if (srName) {
                const srUid = `${srName}|${srSource}`;
                index[cat][srUid] = { category: "races", file: r.file || "" };
              }
            }
          }
        }
      } catch (e) {
      }
    }
  }
  if (outPath) {
    const dir = path.dirname(outPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
  }
  return index;
}
var dataCache = {};
var fileMode = true;
var SearchModal = class extends import_obsidian.SuggestModal {
  getSuggestions(query) {
    if (!query) return [];
    return [query];
  }
  renderSuggestion(value, el) {
    el.createEl("div", { text: `Search for: ${value}` });
  }
  async onChooseItem(query) {
    await this.runSearch(query);
  }
  async onChooseSuggestion(query) {
    await this.runSearch(query);
  }
  async runSearch(query) {
    console.log("\u27A1 Searching:", query);
    try {
      const vf = this.app.vaultforge5etools;
      let results = await vf.searchName(query, "all");
      results = results.map((r) => ensureNormalized(r));
      const grouped = {};
      for (const r of results) {
        const c = r.category ?? r.type ?? "unknown";
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(r);
      }
      const interleaved = [];
      let added = true;
      while (added && interleaved.length < 200) {
        added = false;
        for (const k of Object.keys(grouped)) {
          const arr = grouped[k];
          if (arr && arr.length) {
            interleaved.push(arr.shift());
            added = true;
          }
        }
      }
      if (interleaved.length) results = interleaved;
      if (!results.length) return new import_obsidian.Notice(`No results for "${query}"`);
      new ResultsModal(this.app, results).open();
    } catch (err) {
      console.error("\u274C Search failed:", err);
      new import_obsidian.Notice("Search failed, check console.");
    }
  }
};
var ResultsModal = class extends import_obsidian.SuggestModal {
  constructor(app, results) {
    super(app);
    this.results = results;
  }
  getSuggestions(query) {
    if (!query) return this.results;
    const qn = normalizeName(query);
    const fieldToString = (val) => {
      if (val === null || val === void 0) return "";
      if (typeof val === "string") return val;
      if (typeof val === "number" || typeof val === "boolean") return String(val);
      if (Array.isArray(val)) return val.map((v) => typeof v === "string" ? v : JSON.stringify(v)).join(" ");
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    };
    return this.results.filter((r) => {
      if (!r) return false;
      if (r.__search && typeof r.__search === "string" && r.__search.includes(qn)) return true;
      if (r.parent && normalizeName(fieldToString(r.parent)).includes(qn)) return true;
      if (r.name && normalizeName(String(r.name)).includes(qn)) return true;
      if (r.raw && r.raw.name && normalizeName(String(r.raw.name)).includes(qn)) return true;
      for (const f of VF_MAPS.searchFields) {
        let v = r[f];
        if (v === void 0 && r.raw) v = r.raw[f];
        if (v === void 0) continue;
        if (normalizeName(fieldToString(v)).includes(qn)) return true;
      }
      return false;
    });
  }
  renderSuggestion(item, el) {
    el.createEl("div", { text: `${item.category ?? item.type}: ${item.name} (${item.source || "?"})` });
  }
  async onChooseItem(item) {
    this.showPreview(item);
  }
  async onChooseSuggestion(item) {
    this.showPreview(item);
  }
  showPreview(item) {
    new PreviewModal(this.app, item).open();
  }
};
var PreviewModal = class extends import_obsidian.Modal {
  constructor(app, item) {
    super(app);
    this.item = item;
    this.formatted = this.formatEntry();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.item.name });
    const pre = contentEl.createEl("pre", { text: this.formatted });
    pre.style.whiteSpace = "pre-wrap";
    const btnBar = contentEl.createEl("div", { attr: { style: "display:flex; gap:8px; margin-top:12px;" } });
    const copyBtn = btnBar.createEl("button", { text: "Copy to Clipboard" });
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(this.formatted);
      new import_obsidian.Notice(`Copied ${this.item.name} to clipboard`);
    });
    const insertBtn = btnBar.createEl("button", { text: "Insert into Note" });
    insertBtn.addEventListener("click", () => {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (view) {
        view.editor.replaceSelection(this.formatted + "\n");
        new import_obsidian.Notice(`Inserted ${this.item.name} into note`);
      } else {
        new import_obsidian.Notice("\u274C No active note to insert into");
      }
    });
    const copyForSheetBtn = btnBar.createEl("button", { text: "Copy for Sheet" });
    copyForSheetBtn.addEventListener("click", async () => {
      try {
        const api = this.app.vaultforge5etools;
        const uid = this.item.uid ?? `${this.item.name}|${this.item.source ?? "Unknown"}`;
        const payload = await api.exportForSheet(uid);
        if (!payload) {
          new import_obsidian.Notice("Failed to build sheet payload");
          return;
        }
        await navigator.clipboard.writeText(JSON.stringify(payload));
        new import_obsidian.Notice(`Copied ${this.item.name} JSON for sheet`);
      } catch (e) {
        console.error("Copy for sheet failed", e);
        new import_obsidian.Notice("Failed to copy sheet payload (see console)");
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
  formatEntry() {
    const lines = [];
    if (this.item.description) lines.push(this.item.description);
    if (this.item.traits && Array.isArray(this.item.traits) && this.item.traits.length) {
      lines.push("**Traits:** " + this.item.traits.join(", "));
    }
    if (this.item.race) lines.push("**Race:** " + this.item.race);
    if (this.item.creature_type) lines.push("**Creature Type:** " + this.item.creature_type);
    if (this.item.size) lines.push("**Size:** " + this.item.size);
    if (this.item.speed) lines.push("**Speed:** " + this.item.speed);
    const meta = [
      ["Type", this.item.type],
      ["Rarity", this.item.rarity],
      ["Source", this.item.source],
      ["Requirements", this.item.requirements],
      ["Weight", this.item.weight],
      ["Attunement", this.item.attunement],
      ["Level", this.item.level],
      ["School", this.item.school],
      ["Strength", this.item.strength],
      ["Value", this.item.value]
    ];
    for (const [label, val] of meta) {
      if (val) lines.push(`**${label}:** ${val}`);
    }
    if (this.item.class) lines.push("**Class:** " + this.item.class);
    if (this.item.subclass) lines.push("**Subclass:** " + this.item.subclass);
    return `### ${this.item.name}

${lines.join("\n\n")}
`;
  }
};
var VaultForge5eTools = class extends import_obsidian.Plugin {
  async onload() {
    console.log("[VaultForge-5eTools] loaded \u2705");
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new VaultForge5eToolsSettingTab(this.app, this));
    const dbPath = pluginPath(this, this.settings.dbPath);
    const dataPath = pluginPath(this, this.settings.dataPath);
    try {
      if (!fs.existsSync(dataPath)) {
        throw new Error("5eTools /data folder missing!");
      }
      console.log("[VaultForge-5eTools] Using raw /data folder at", dataPath);
    } catch (err) {
      console.error("Failed to access data folder:", err);
      new import_obsidian.Notice("VaultForge-5eTools failed to access /data folder.");
    }
    this.app.vaultforge5etools = {
      masterIndex: null,
      buildMasterIndex: async () => {
        const dataPathAbs = pluginPath(this, this.settings.dataPath);
        const out = pluginPath(this, "cache/master-index.json");
        const idx = await buildMasterIndex(dataPathAbs, out);
        this.app.vaultforge5etools.masterIndex = idx;
        return idx;
      },
      getTable: async (table) => {
        const dataPathAbs = pluginPath(this, this.settings.dataPath);
        if (!dataCache[table]) {
          dataCache[table] = await readTableFromData(dataPathAbs, table);
        }
        dataCache[table] = dataCache[table].map((e) => ensureNormalized(e));
        return dataCache[table];
      },
      refreshCache: async (table) => {
        const dataPathAbs = pluginPath(this, this.settings.dataPath);
        if (table) {
          dataCache[table] = await readTableFromData(dataPathAbs, table);
          return { success: true, table };
        } else {
          for (const k of Object.keys(dataCache)) delete dataCache[k];
          return { success: true };
        }
      },
      // Fast single-uid lookup using the master index (builds index when missing)
      getByUid: async (uid) => {
        const api = this.app.vaultforge5etools;
        const idx = api.masterIndex ?? await api.buildMasterIndex();
        for (const cat of Object.keys(idx)) {
          if (idx[cat] && idx[cat][uid]) {
            const meta = idx[cat][uid];
            const dataPathAbs = pluginPath(this, this.settings.dataPath);
            const rows = await readTableFromData(dataPathAbs, meta.category === "class" ? "classes" : meta.category);
            const found = rows.find((r) => r.uid === uid);
            return found ? ensureNormalized(found) : null;
          }
        }
        return null;
      },
      searchName: async (q, type = "all") => {
        const dataPathAbs = pluginPath(this, this.settings.dataPath);
        const types = type === "all" ? ["spells", "items", "bestiary", "races", "classes", "feats"] : [type === "monsters" ? "bestiary" : type];
        let results = [];
        const qn = normalizeName(q);
        const isSingleToken = /^[a-z0-9]+$/.test(qn) && qn.length > 0;
        const fieldToString = (val) => {
          if (val === null || val === void 0) return "";
          if (typeof val === "string") return val;
          if (typeof val === "number" || typeof val === "boolean") return String(val);
          if (Array.isArray(val)) return val.map((v) => typeof v === "string" ? v : JSON.stringify(v)).join(" ");
          if (typeof val === "object") return JSON.stringify(val);
          return String(val);
        };
        for (const t of types) {
          const rawRows = dataCache[t] ?? await readTableFromData(dataPathAbs, t);
          const rows = rawRows.map((r) => ensureNormalized(r));
          for (const row of rows) {
            if (row.__search && typeof row.__search === "string") {
              if (!isSingleToken) {
                if (row.__search.includes(qn)) {
                  results.push({ category: t, ...row });
                  continue;
                }
              } else {
                const sTokens = row.__search.match(/[a-z0-9]+/g) || [];
                if (sTokens.includes(qn)) {
                  results.push({ category: t, ...row });
                  continue;
                }
              }
            }
            if (row.parent) {
              const ptoken = normalizeName(fieldToString(row.parent));
              if (ptoken.includes(qn)) {
                results.push({ category: t, ...row });
                continue;
              }
            }
            if (row.name && normalizeName(String(row.name)).includes(qn)) {
              results.push({ category: t, ...row });
              continue;
            }
            if (row.raw && row.raw.name && normalizeName(String(row.raw.name)).includes(qn)) {
              results.push({ category: t, ...row });
              continue;
            }
            let matched = false;
            for (const field of VF_MAPS.searchFields) {
              let val = row[field];
              if (val === void 0 && row.raw) val = row.raw[field];
              if (val === void 0) continue;
              const fv = normalizeName(fieldToString(val));
              if (fv.includes(qn)) {
                matched = true;
                break;
              }
            }
            if (matched) results.push({ category: t, ...row });
          }
        }
        if (isSingleToken) {
          const allowedCats = /* @__PURE__ */ new Set(["races", "bestiary", "feats", "classes"]);
          results = results.filter((r) => {
            const cat = String(r.category ?? r.type ?? "").toLowerCase();
            if (!allowedCats.has(cat)) return false;
            const q2 = qn;
            if (r.name && normalizeName(String(r.name)) === q2) return true;
            if (r.race && normalizeName(String(r.race)) === q2) return true;
            if (r.parent && normalizeName(String(r.parent)) === q2) return true;
            if (Array.isArray(r.traits) && r.traits.some((t) => normalizeName(String(t)) === q2)) return true;
            if (Array.isArray(r.traitTags) && r.traitTags.some((t) => normalizeName(String(t)) === q2)) return true;
            if (Array.isArray(r.tags) && r.tags.some((t) => normalizeName(String(t)) === q2)) return true;
            if (r.creature_type && normalizeName(String(r.creature_type)).split(/[^a-z0-9]+/).includes(q2)) return true;
            if (r.classes) {
              const cls = Array.isArray(r.classes) ? r.classes : [r.classes];
              if (cls.some((c) => normalizeName(String((c && c.name) ?? c)) === q2)) return true;
            }
            return false;
          });
        }
        return results;
      },
      exportForSheet: async (uid) => {
        const api = this.app.vaultforge5etools;
        const entry = await api.getByUid(uid);
        if (!entry) return null;
        const norm = ensureNormalized(entry);
        return {
          uid: norm.uid,
          name: norm.name,
          type: norm.type || norm.__table || null,
          source: norm.source || null,
          description: norm.description || null,
          rarity: norm.rarity || null,
          level: norm.level ?? null,
          school: norm.school || null,
          weight: norm.weight ?? null,
          attunement: norm.attunement ?? null,
          traits: norm.traits || [],
          classes: norm.classes || [],
          race: norm.race || null,
          speed: norm.speed || null,
          value: norm.value ?? null,
          raw: norm.raw ?? null
        };
      }
    };
    this.addCommand({
      id: "5etools-search",
      name: "Search 5eTools",
      checkCallback: (checking) => {
        if (checking) return true;
        new SearchModal(this.app).open();
      }
    });
  }
  onunload() {
    console.log("[VaultForge-5eTools] stopped \u274C");
  }
};
var VaultForge5eToolsSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "VaultForge-5eTools Settings" });
    new import_obsidian.Setting(containerEl).setName("Data Path").setDesc("Folder containing the 5e.tools 'data' folder").addText((text) => text.setValue(this.plugin.settings.dataPath).onChange(async (val) => {
      this.plugin.settings.dataPath = val;
      await this.plugin.saveData(this.plugin.settings);
    }));
    new import_obsidian.Setting(containerEl).setName("Rebuild Index").setDesc("Regenerate the master index from the /data folder.").addButton(
      (button) => button.setButtonText("Rebuild Index").setCta().onClick(async () => {
        const dataPath = pluginPath(this.plugin, this.plugin.settings.dataPath);
        await buildMasterIndex(dataPath, pluginPath(this.plugin, "cache/master-index.json"));
        new import_obsidian.Notice("Master index rebuilt");
      })
    );
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  fileMode
});
