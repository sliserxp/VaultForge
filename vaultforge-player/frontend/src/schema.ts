export const characterSchema = {
  // Character Info
  core: {
    type: "group",
    label: "Character",
    fields: {
      name: { type: "string", label: "Character Name" },
      class: { type: "string", label: "Class & Level" },
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
      hp_temp: { type: "number", label: "Temporary HP" }
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

  // Saving Throws & Skills
  proficiencies: {
    type: "group",
    label: "Proficiencies",
    fields: {
      saving_throws: {
        type: "map",
        label: "Saving Throws",
        options: ["none", "proficient"]
      },
      skills: {
        type: "map",
        label: "Skills",
        options: ["none", "proficient", "expertise"]
      }
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
      qty: { type: "number", label: "Qty" }
    }
  },

  // Currency
  currency: {
    type: "group",
    label: "Currency",
    fields: {
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
      race_features: { type: "textarea", label: "Racial Features" },
      class_features: { type: "textarea", label: "Class Features" },
      feats: { type: "textarea", label: "Feats" }
    }
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
