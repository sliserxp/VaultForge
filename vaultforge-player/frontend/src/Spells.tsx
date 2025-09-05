import React from "react";


interface Spell {
name: string;
level: number;
school: string;
prepared?: boolean;
}


interface SpellsProps {
spells: Spell[];
onTogglePrepared: (index: number) => void;
onRemove: (index: number) => void;
}


export function Spells({ spells, onTogglePrepared, onRemove }: SpellsProps) {
if (!spells || spells.length === 0) {
return <p>No spells known.</p>;
}


return (
<div className="p-4">
<h2 className="text-xl font-bold mb-4">✨ Spells</h2>
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
{spells.map((spell, idx) => (
<div
key={idx}
className="p-3 rounded-lg bg-gray-700 shadow flex justify-between"
>
<div>
<h3 className="font-semibold">{spell.name}</h3>
<p className="text-sm text-gray-300">
L{spell.level} • {spell.school}
</p>
<p className="text-sm">
{spell.prepared ? "✅ Prepared" : "❌ Not prepared"}
</p>
</div>
<div className="flex flex-col gap-2">
<button
className="px-3 py-1 bg-blue-600 text-white rounded"
onClick={() => onTogglePrepared(idx)}
>
Toggle
</button>
<button
className="px-3 py-1 bg-red-600 text-white rounded"
onClick={() => onRemove(idx)}
>
Remove
</button>
</div>
</div>
))}
</div>
</div>
);
}
