import React, { useEffect, useState } from "react";

export default function Character() {
  const [players, setPlayers] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<any>(null);

  // Load saved selection from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("selectedPlayer");
    if (saved) {
      setSelected(saved);
    }
  }, []);

  // Fetch player list (from backend)
  useEffect(() => {
    fetch("/api/players")
      .then(res => res.json())
      .then(setPlayers)
      .catch(err => console.error("Failed to fetch players", err));
  }, []);

  // Fetch sheet when player selected
  useEffect(() => {
    if (selected) {
      localStorage.setItem("selectedPlayer", selected);
      fetch(`/api/player/${selected}`)
        .then(res => res.json())
        .then(setSheet)
        .catch(() => setSheet(null));
    }
  }, [selected]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">Character</h2>

      <select
        className="bg-gray-800 text-gray-200 p-2 rounded"
        value={selected ?? ""}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">-- Select Character --</option>
        {players.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      {sheet ? (
        <div className="mt-4">
          <h3 className="text-lg font-semibold">{sheet.name}</h3>
          <p>Class: {sheet.class} | Race: {sheet.race}</p>
          <p>HP: {sheet.hp?.current}/{sheet.hp?.max}</p>
        </div>
      ) : (
        selected && <p className="mt-4">No sheet data found.</p>
      )}
    </div>
  );
}

