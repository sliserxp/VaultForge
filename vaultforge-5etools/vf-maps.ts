// vaultforge-5etools/vf-maps.ts
// Centralized maps/configuration for VaultForge search and category aliases.
// Edit this file to add/remove fields or categories without touching main.ts.

export const VF_MAPS = {
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
    "attunement",
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
    generated: "generated",
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
    generated: ["name", "entries"],
  },

  // Optional: preferred index paths inside /data for faster file selection (the readTableFromData already checks some index.json patterns)
  preferredIndexPaths: {
    spells: "spells/index.json",
    bestiary: "bestiary/index.json",
    class: "class/index.json",
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

  makeClassExportEntry: (fileOrClass: any, subclasses?: any[]) => {
    // Delegates full extraction to vaultforge-5etools/vf-class-export.ts
    // Use require to keep this file plain JS/TS-compatible without extra imports at top
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const helper = require("./vf-class-export");
    return helper.makeClassExportMap(fileOrClass, subclasses);
  },

};
