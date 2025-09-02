import React, { useState, useEffect } from "react";
import { characterSchema } from "./schema";
import { RenderField } from "./RenderField";
import ShopView from "./ShopView";

export default function App() {
  const [tab, setTab] = useState("Character");
  const [players, setPlayers] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [player, setPlayer] = useState<any>(null);

  const tabs = ["Character", "Inventory", "Spells", "Shop", "Talk", "Lore"];

  // Load players list
  useEffect(() => {
    fetch("/api/players").then(r => r.json()).then(setPlayers);
  }, []);

  // Load selected player
  useEffect(() => {
    if (selected) {
      fetch(`/api/player/${selected}`).then(r => r.json()).then(setPlayer);
    }
  }, [selected]);

  async function updatePlayer(updates: any) {
    if (!selected) return;
    await fetch(`/api/player/${selected}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setPlayer({ ...player, ...updates }); // optimistic update
  }
  
  const renderTab = () => {
    switch (tab) {
      case "Character":
        if (!player) {
          return (
            <div>
              <h1 className="text-xl font-bold mb-2">Select Character</h1>
              <select
                className="border p-2"
                value={selected}
                onChange={e => setSelected(e.target.value)}
              >
                <option value="">-- Choose --</option>
                {players.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <div className="space-y-6">
            {Object.entries(characterSchema).map(([field, schema]) => (
              <div key={field} className="border rounded p-3 bg-white shadow">
                <h2 className="text-lg font-bold mb-2">{schema.label || field}</h2>
                <RenderField
                  schema={schema}
                  value={player[field]}
                  onChange={(val: any) => updatePlayer({ [field]: val })}
                />
              </div>
            ))}
          </div>
        );
      case "Inventory": return <div>Inventory Tab Placeholder</div>;
      case "Spells": return <div>Spells Tab Placeholder</div>;
      case "Shop":
        if (!player) {
          return <div>Please select a character first.</div>;
        }

        function handleBuy(item: any) {
          const cost = item.value ? item.value / 100 : 0; // cp → gp
          const totalGold = coinsToGoldDecimal(player);

          if (totalGold >= cost) {
            const remaining = totalGold - cost;
            const newCoins = goldDecimalToCoins(remaining);

            updatePlayer({
              ...newCoins,
              inventory: [...(player.inventory ?? []), item],
            });
          } else {
            alert("Not enough money!");
          }
        }

        function coinsToGoldDecimal(p: any): number {
          return (
            (p.platinum ?? 0) * 10 +
            (p.gold ?? 0) +
            (p.silver ?? 0) / 10 +
            (p.copper ?? 0) / 100
          );
        }

        function goldDecimalToCoins(totalGold: number) {
          let cp = Math.round(totalGold * 100); // store in copper for precision

          const platinum = Math.floor(cp / 1000); // 1000 cp = 10 gp = 1 pp
          cp -= platinum * 1000;

          const gold = Math.floor(cp / 100);
          cp -= gold * 100;

          const silver = Math.floor(cp / 10);
          cp -= silver * 10;

          const copper = cp;

          return { platinum, gold, silver, copper };
        }

        return (
          <ShopView
            gold={coinsToGoldDecimal(player)}
            coins={{
              platinum: player.platinum ?? 0,
              gold: player.gold ?? 0,
              silver: player.silver ?? 0,
              copper: player.copper ?? 0,
            }}
            onBuy={handleBuy}
          />
        );

      case "Talk": return <div>Talk Tab Placeholder</div>;
      case "Lore": return <div>Lore Tab Placeholder</div>;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <nav className="flex justify-around bg-gray-800 p-2">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg ${tab === t ? "bg-blue-600 text-white" : "text-gray-200"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      <main className="p-4 flex-1 overflow-y-auto">{renderTab()}</main>
    </div>
  );
}

