import React, { useState, useEffect } from "react";

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
    // normalized.value from 5etools is already in gp (or a numeric score). Use it directly.
    cost: raw.value ?? 0,
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
  player: any; // Assuming you have access to the player object
  selected: string; // The selected player's name
  updatePlayer: (updates: any) => Promise<void>; // Function to update player
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

export default function ShopView({ gold, coins, onBuy, player, selected, updatePlayer }: ShopViewProps) {
  const [allItems, setAllItems] = useState<VFItem[]>([]);
  const [query, setQuery] = useState("");
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [currentSubCategory, setCurrentSubCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/items")
      .then(response => response.json())
      .then(data => setAllItems(data.map(toVFItem)))
      .catch(err => console.error("Failed to load items from API", err));
  }, []);

  // Helper: convert player coins object -> decimal gp
  function coinsToGoldDecimal(p: any): number {
    if (!p) return 0;
    return (
      (p.platinum ?? 0) * 10 +
      (p.gold ?? 0) +
      (p.silver ?? 0) / 10 +
      (p.copper ?? 0) / 100
    );
  }

  // Helper: convert decimal gp -> coins object (pp, gp, sp, cp)
  function goldDecimalToCoins(totalGold: number) {
    let cp = Math.round(totalGold * 100);
    const platinum = Math.floor(cp / 1000);
    cp -= platinum * 1000;
    const gold = Math.floor(cp / 100);
    cp -= gold * 100;
    const silver = Math.floor(cp / 10);
    cp -= silver * 10;
    const copper = cp;
    return { platinum, gold, silver, copper };
  }

  function handleBuy(item: VFItem) {
    const cost = item.cost ? item.cost : 0; // Ensure cost is defined
    const totalGold = coinsToGoldDecimal(player); // Assuming you have access to the player object

    if (totalGold >= cost) {
      const remaining = totalGold - cost;
      const newCoins = goldDecimalToCoins(remaining);

      // Update the player's inventory
      updatePlayer({
        ...newCoins,
        inventory: [...(player.inventory ?? []), item], // Add the purchased item
      });
    } else {
      alert("Not enough money!");
    }
  }

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
                  onClick={() => handleBuy(item)} // Call handleBuy on click
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