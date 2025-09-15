export const characterSchema = {
  // Character Info
  core: {
    type: "group",
    label: "Character",
    fields: {
      name: { type: "string", label: "Character Name" },
      class: { type: "string", label: "Class" },
      subclass: { type: "string", label: "Subclass" },
      race: { type: "string", label: "Race" },
      background: { type: "string", label: "Background" },
      alignment: { type: "string", label: "Alignment" },
      level: { type: "number", label: "Level" },
      xp: { type: "number", label: "Experience Points" },
      player: { type: "string", label: "Player Name" }
    }
  },

  // Health
  hp: {
    type: "group",
    label: "Health",
    fields: {
      hp_max: { type: "number", label: "Max HP" },
      hp_current: { type: "number", label: "Current HP" },
      hp_temp: { type: "number", label: "Temporary HP" },
      hit_die: { type: "string", label: "Class Hit Die" }
    }
  },

  // Combat
  combat: {
    type: "group",
    label: "Combat Stats",
    fields: {
      armor_class: { type: "number", label: "Armor Class" },
      initiative: { type: "number", label: "Initiative" },
      speed: { type: "number", label: "Speed" },
      inspiration: { type: "boolean", label: "Inspiration" },
      proficiency_bonus: { type: "number", label: "Proficiency Bonus" },
      passive_perception: { type: "number", label: "Passive Perception" }
    }
  },

  // Abilities
  abilities: {
    type: "group",
    label: "Abilities",
    fields: {
      strength: { type: "number", label: "Strength" },
      dexterity: { type: "number", label: "Dexterity" },
      constitution: { type: "number", label: "Constitution" },
      intelligence: { type: "number", label: "Intelligence" },
      wisdom: { type: "number", label: "Wisdom" },
      charisma: { type: "number", label: "Charisma" }
    }
  },

  //Skills
  skills: {
    type: "group",
    label: "Skills",
    fields: {
        Athletics: { type: "select", label: "Athletics", options: ["none","proficient","expertise"] },
        Acrobatics: { type: "select", label: "Acrobatics", options: ["none","proficient","expertise"] },
        Slight_of_Hand: { type: "select", label: "Slight of Hand", options: ["none","proficient","expertise"] },
        Arcana: { type: "select", label: "Arcana", options: ["none","proficient","expertise"] }, 
        History: { type: "select", label: "History", options: ["none","proficient","expertise"] },
        Investigation: { type: "select", label: "Investigation", options: ["none","proficient","expertise"] },
        Nature: { type: "select", label: "Nature", options: ["none","proficient","expertise"] },
        Religion: { type: "select", label: "Religion", options: ["none","proficient","expertise"] },
        Animal_Handling: { type: "select", label: "Animal Handling", options: ["none","proficient","expertise"] },
        Insight: { type: "select", label: "Insight", options: ["none","proficient","expertise"] },
        Medicine: { type: "select", label: "Medicine", options: ["none","proficient","expertise"] },
        Perception: { type: "select", label: "Perception", options: ["none","proficient","expertise"] },
        Survival: { type: "select", label: "Survival", options: ["none","proficient","expertise"] },
        Deception: { type: "select", label: "Deception", options: ["none","proficient","expertise"] },
        Intimidation: { type: "select", label: "Intimidation", options: ["none","proficient","expertise"] },
        Performance: { type: "select", label: "Performance", options: ["none","proficient","expertise"] },
        Persuasion: { type: "select", label: "Persuasion", options: ["none","proficient","expertise"] }     
     }
  },
  // Attacks
  attacks: {
    type: "list",
    label: "Weapons & Attacks",
    itemFields: {
      name: { type: "string", label: "Weapon" },
      attack: { type: "number", label: "Attack Bonus" },
      damage: { type: "string", label: "Damage/Type" },
      range: { type: "string", label: "Range" }
    }
  },

  // Inventory
  inventory: {
    type: "list",
    label: "Inventory",
    itemFields: {
      name: { type: "string", label: "Item" },
      qty: { type: "number", label: "Qty" },
      cost: { type: "number", label: "Cost (gp)", default: 0 },
      rarity: { type: "string", label: "Rarity" },
      source: { type: "string", label: "Source" },
      grantedBy: { type: "string", label: "Granted By" }
    }
  },

  // Currency
  currency: {
    type: "group",
    label: "Currency",
    fields: {
      Wrold_Fragments: { type: "number", label: "World Fragments" },
      Value: { type: "number", label: "Gp Total" },
      platinum: { type: "number", label: "Platinum", default: 0 },
      gold: { type: "number", label: "Gold", default: 0 },
      silver: { type: "number", label: "Silver", default: 0 },
      copper: { type: "number", label: "Copper", default: 0 }
    }
  },

  // Spells
  spells: {
    type: "group",
    label: "Spells",
    fields: {
      spellcasting_ability: { type: "string", label: "Spellcasting Ability" },
      spell_save_dc: { type: "number", label: "Spell Save DC" },
      spell_attack_bonus: { type: "number", label: "Spell Attack Bonus" },
      cantrips: {
        type: "list",
        label: "Cantrips",
        itemFields: { name: { type: "string" } }
      },
      level_1_slots: { type: "number", label: "Level 1 Slots" },
      level_1_used: { type: "number", label: "Level 1 Used" },
      level_1_prepared: {
        type: "list",
        label: "Level 1 Prepared",
        itemFields: { name: { type: "string" } }
      }
      // 👉 Add more levels (2–9) later in the same flat way
    }
  },

  // Traits
  traits: {
    type: "group",
    label: "Traits & Features",
    fields: {
      race_features: {
        type: "list",
        label: "Racial Features",
        itemFields: { title: { type: "string" }, text: { type: "textarea" } }
      },
      class_features: {
        type: "list",
        label: "Class Features",
        itemFields: { title: { type: "string" }, text: { type: "textarea" } }
      },
      subclass_features: {
        type: "list",
        label: "Subclass Features",
        itemFields: { title: { type: "string" }, text: { type: "textarea" } }
      },
      background_description: { type: "textarea", label: "BG Description"},
      feats: { type: "textarea", label: "Feats" }
    }
  },

  // Profinciencies
  Profinciencies: {
    typle: "list",
    label: "Proficiencies",
    itemFields:{ name: { type: "string" } },
   },

  // Character Details
  details: {
    type: "group",
    label: "Character Details",
    fields: {
      age: { type: "string", label: "Age" },
      height: { type: "string", label: "Height" },
      weight: { type: "string", label: "Weight" },
      hair: { type: "string", label: "Hair" },
      eyes: { type: "string", label: "Eyes" },
      skin: { type: "string", label: "Skin" },
      personality: { type: "textarea", label: "Personality Traits" },
      ideals: { type: "textarea", label: "Ideals" },
      bonds: { type: "textarea", label: "Bonds" },
      flaws: { type: "textarea", label: "Flaws" },
      allies: { type: "textarea", label: "Allies & Organizations" },
      enemies: { type: "textarea", label: "Enemies" },
      backstory: { type: "textarea", label: "Backstory" }
    }
  },

  // External import helper (from VaultForge)
  externalImport: {
    type: "group",
    label: "Imported Entry",
    fields: {
      uid: { type: "string", label: "UID" },
      name: { type: "string", label: "Name" },
      type: { type: "string", label: "Type" }
    }
  },

  undefined: {
    type: "list",
    label: "Undefined / Unmapped",
    itemFields: {
      key: { type: "string", label: "Key" },
      example: { type: "string", label: "Example Value" }
    }
  },

  // Death Saves
  death_saves: {
    type: "group",
    label: "Death Saves",
    fields: {
      death_successes: { type: "number", label: "Successes" },
      death_failures: { type: "number", label: "Failures" }
    }
  }
};
