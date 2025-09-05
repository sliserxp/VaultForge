import React from "react";


interface InventoryProps {
items: any[];
onRemove: (index: number) => void;
}


export function Inventory({ items, onRemove }: InventoryProps) {
if (!items || items.length === 0) {
return <p>No items in inventory.</p>;
}


return (
<div className="p-4">
<h2 className="text-xl font-bold mb-4">🎒 Inventory</h2>
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
{items.map((item, idx) => (
<div
key={idx}
className="p-3 rounded-lg bg-gray-700 shadow flex justify-between"
>
<div>
<h3 className="font-semibold">{item.name}</h3>
<p className="text-sm text-gray-300">{item.rarity}</p>
{item.cost && (
<p className="text-sm">Cost: {item.cost.toFixed(2)} gp</p>
)}
</div>
<button
className="px-3 py-1 bg-red-600 text-white rounded"
onClick={() => onRemove(idx)}
>
Remove
</button>
</div>
))}
</div>
</div>
);
}
