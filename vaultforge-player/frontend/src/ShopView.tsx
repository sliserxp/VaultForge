import React, { useState, useEffect } from "react";
import items from "./data/items/items.json";

export interface VFItem {
  name: string;
  type: string;
  rarity: string;
  cost?: number;
  weight?: number;
  source: string;
  poison?: boolean;
  wondrous?: boolean;
  reqAttune?: boolean;
  weapon?: boolean;
  armor?: boolean;
}

function toVFItem(raw: any): VFItem {
  return {
    name: raw.name,
    type: raw.type || "gear",
    rarity: raw.rarity || "common",
    cost: raw.value ? raw.value / 100 : 0, // cp → gp
    weight: raw.weight || 0,
    source: raw.source || "Unknown",
    poison: raw.poison,
    wondrous: raw.wondrous,
    reqAttune: raw.reqAttune,
    weapon: raw.weapon,
    armor: raw.armor
  };
}

interface ShopViewProps {
  gold: number;
  coins?: { platinum: number; gold: number; silver: number; copper: number };
  onBuy: (item: VFItem) => void;
}

/* ---------- Category definitions ---------- */
const categoryMap: Record<string, Record<string, (item: VFItem) => boolean>> = {
  Weapons: {
    Melee: (i) => i.type.startsWith("M"),   // M = melee
    Ranged: (i) => i.type.startsWith("R"), // R = ranged
  },
  Armor: {
    "Light Armor": (i) => i.type.startsWith("LA"),
    "Medium Armor": (i) => i.type.startsWith("MA"),
    "Heavy Armor": (i) => i.type.startsWith("HA"),
    Shields: (i) => i.type.startsWith("S"),
  },
  "Bottles-Boom-Consume": {
    Potions: (i) => i.type.startsWith("P"),
    Poisons: (i) => !!i.poison,
    Explosives: (i) => i.type.startsWith("EXP") || i.type.startsWith("SPC"),
  },
  Gear: {
    Instruments: (i) => i.type.startsWith("INS"),
    Focus: (i) => i.type.startsWith("SCF"),
    "General Gear": (i) => i.type.startsWith("G"),
  },
  Magic: {
    "Wondrous Items": (i) => !!i.wondrous,
    "Requires Attunement": (i) => !!i.reqAttune,
  },
};

const typeLabels: Record<string, string> = {
  // Weapons
  M: "Melee Weapon",
  R: "Ranged Weapon",

  // Armor & Shields
  LA: "Light Armor",
  MA: "Medium Armor",
  HA: "Heavy Armor",
  S: "Shield",

  // Gear / Supplies
  G: "Gear",
  GS: "Adventuring Gear",
  INS: "Instrument",
  SCF: "Spellcasting Focus",

  // Potions / Consumables
  P: "Potion",
  SPC: "Special Component",
  EXP: "Explosive",

  // Vehicles / Mounts
  VEH: "Vehicle",
  MNT: "Mount",
  SHP: "Ship",
  AIR: "Airship",

  // Misc
  OTH: "Other",
  TG: "Trade Good",
};

export default function ShopView({ gold, coins, onBuy }: ShopViewProps) {
  const [allItems, setAllItems] = useState<VFItem[]>([]);
  const [query, setQuery] = useState("");
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [currentSubCategory, setCurrentSubCategory] = useState<string | null>(
    null
  );

  useEffect(() => {
    let raw: any[] = [];
    if (Array.isArray(items)) raw = items as any[];
    else if ((items as any).item) raw = (items as any).item;
    setAllItems(raw.map(toVFItem));
  }, []);

  /* ---------- Filter ---------- */
  let displayItems: VFItem[] = [];

  if (currentCategory && currentSubCategory) {
    const filterFn = categoryMap[currentCategory][currentSubCategory];
    displayItems = allItems.filter(filterFn);
  } else if (query.trim()) {
    displayItems = allItems.filter((i) =>
      i.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">🛒 Adventurer’s Shop</h2>

      {/* Display coins & total wealth */}
      {coins ? (
        <div className="mb-4">
          <p className="font-semibold">
            💰 Wealth: {coins.platinum}pp {coins.gold}gp {coins.silver}sp{" "}
            {coins.copper}cp
          </p>
          <p className="text-sm text-gray-300">(≈ {gold.toFixed(2)} gp)</p>
        </div>
      ) : (
        <p className="mb-4">💰 Total Gold: {gold.toFixed(2)} gp</p>
      )}

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setCurrentCategory(null);
          setCurrentSubCategory(null);
        }}
        className="flex gap-2 mb-4"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 p-2 rounded bg-gray-800 text-white"
          placeholder="Search items..."
        />
        <button
          type="submit"
          className="px-3 py-2 bg-blue-600 text-white rounded"
        >
          Search
        </button>
      </form>

      {/* Category navigation */}
      {!query && !currentCategory && (
        <div className="grid grid-cols-2 gap-3">
          {Object.keys(categoryMap).map((cat) => (
            <button
              key={cat}
              onClick={() => setCurrentCategory(cat)}
              className="p-4 bg-gray-700 rounded-lg"
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Sub-category navigation */}
      {!query && currentCategory && !currentSubCategory && (
        <div>
          <button
            onClick={() => setCurrentCategory(null)}
            className="mb-4 text-blue-400"
          >
            ← Back
          </button>
          <div className="grid grid-cols-2 gap-3">
            {Object.keys(categoryMap[currentCategory]).map((sub) => (
              <button
                key={sub}
                onClick={() => setCurrentSubCategory(sub)}
                className="p-4 bg-gray-700 rounded-lg"
              >
                {sub}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Item list */}
      {(query || (currentCategory && currentSubCategory)) && (
        <div>
          {(currentCategory || query) && (
            <button
              onClick={() => {
                setCurrentCategory(null);
                setCurrentSubCategory(null);
                setQuery("");
              }}
              className="mb-4 text-blue-400"
            >
              ← Back to Categories
            </button>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayItems.map((item) => (
              <div
                key={item.name}
                className="p-3 rounded-lg bg-gray-700 shadow"
              >
                <h3 className="font-semibold">{item.name}</h3>
                <p className="text-sm text-gray-300">
                  {item.rarity} • {item.source}
                </p>
                <p className="text-sm">
                  Cost: {item.cost > 0 ? item.cost.toFixed(2) + " gp" : "—"}
                </p>
                <button
                  className="mt-2 px-3 py-1 bg-green-600 text-white rounded"
                  onClick={() => onBuy(item)}
                >
                  Buy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
