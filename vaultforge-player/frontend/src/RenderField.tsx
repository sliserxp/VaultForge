import React from "react";

const ABILITIES = new Set(["Strength","Dexterity","Constitution","Intelligence","Wisdom","Charisma"]);
const SKILL_MAP: Record<string, string> = {
  Athletics: 'strength',
  Acrobatics: 'dexterity',
  Sleight_of_Hand: 'dexterity',
  Stealth: 'dexterity',
  Arcana: 'intelligence',
  History: 'intelligence',
  Investigation: 'intelligence',
  Nature: 'intelligence',
  Religion: 'intelligence',
  Animal_Handling: 'wisdom',
  Insight: 'wisdom',
  Medicine: 'wisdom',
  Perception: 'wisdom',
  Survival: 'wisdom',
  Deception: 'charisma',
  Intimidation: 'charisma',
  Performance: 'charisma',
  Persuasion: 'charisma'
};

function abilityModifier(score: number): number {
  return Math.floor((Number(score || 0) - 10) / 2);
}

export function RenderField({ schema, value, onChange, parentValue }: any) {
  switch (schema.type) {
    case "string":
      return (
        <input
          type="text"
          className="border p-1 w-full"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "number":
      {
        const v = value ?? 0;
        const showMod = typeof schema.label === 'string' && ABILITIES.has(schema.label);
        const mod = showMod ? abilityModifier(Number(v)) : null;
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="border p-1 w-24"
              value={v}
              onChange={e => onChange(Number(e.target.value))}
            />
            {showMod && (
              <span className="text-sm text-gray-400">{mod >= 0 ? `+${mod}` : `${mod}`}</span>
            )}
          </div>
        );
      }
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
        />
      );
    case "textarea":
      return (
        <textarea
          className="border p-2 w-full"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "map":
      // Special-case Skills map to provide prof/exp checkboxes and computed bonus
      if (schema.label === 'Skills') {
        // parentValue should be the core group (contains abilities and combat)
        const root = parentValue || {};
        const abilities = root.abilities || {};
        const profBonus = (root?.combat?.proficiency_bonus) ?? (root?.proficiency_bonus) ?? 0;
        const out = { ...(value || {}) };

        const renderSkillRow = (displayName: string, key: string) => {
          const cur = out[key] ?? 'none';
          const abilityKey = SKILL_MAP[displayName] ?? 'strength';
          const abilityScore = Number(abilities[abilityKey] ?? 10);
          const base = abilityModifier(abilityScore);
          let bonus = base;
          if (cur === 'proficient') bonus = base + Number(profBonus);
          if (cur === 'expertise') bonus = base + Number(profBonus) * 2;

          const toggle = (state: 'none'|'proficient'|'expertise') => {
            out[key] = state;
            onChange(out);
          };

          return (
            <div key={key} className="flex items-center justify-between p-1">
              <div className="flex items-center gap-4">
                <div className="w-36">{displayName.replace(/_/g,' ')}</div>
                <div className="text-xs text-gray-500">{abilityKey.slice(0,3)}</div>
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={cur === 'proficient' || cur === 'expertise'} onChange={e => toggle(e.target.checked ? 'proficient' : 'none')} /> Prof</label>
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={cur === 'expertise'} onChange={e => toggle(e.target.checked ? 'expertise' : (cur === 'expertise' ? 'proficient' : cur))} /> Exp</label>
              </div>
              <div className="text-sm">{bonus >= 0 ? `+${bonus}` : `${bonus}`}</div>
            </div>
          );
        };

        return (
          <div className="space-y-1">
            {Object.keys(SKILL_MAP).map(k => renderSkillRow(k, k))}
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {Object.entries(value || {}).map(([k, v]) => (
            <div key={k} className="flex items-center space-x-2">
              <label className="w-32 capitalize">{k}</label>
              <select
                className="border p-1"
                value={v}
                onChange={e => onChange({ ...value, [k]: e.target.value })}
              >
                {schema.options.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    case "group":
      // Special-case Skills group to provide prof/exp UI similar to previous 'map' behavior
      if (schema.label === 'Skills') {
        const root = parentValue || value || {};
        const abilities = root.abilities || {};
        const profBonus = (root?.combat?.proficiency_bonus) ?? (root?.proficiency_bonus) ?? 0;
        const out = { ...(value || {}) };

        const renderSkillRow = (displayName: string, key: string) => {
          const cur = out[key] ?? 'none';
          const abilityKey = SKILL_MAP[displayName] ?? 'strength';
          const abilityScore = Number(abilities[abilityKey] ?? 10);
          const base = abilityModifier(abilityScore);
          let bonus = base;
          if (cur === 'proficient') bonus = base + Number(profBonus);
          if (cur === 'expertise') bonus = base + Number(profBonus) * 2;

          const toggle = (state: 'none'|'proficient'|'expertise') => {
            out[key] = state;
            onChange(out);
          };

          return (
            <div key={key} className="flex items-center justify-between p-1">
              <div className="flex items-center gap-4">
                <div className="w-36">{displayName.replace(/_/g,' ')}</div>
                <div className="text-xs text-gray-500">{abilityKey.slice(0,3)}</div>
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={cur === 'proficient' || cur === 'expertise'} onChange={e => toggle(e.target.checked ? 'proficient' : 'none')} /> Prof</label>
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={cur === 'expertise'} onChange={e => toggle(e.target.checked ? 'expertise' : (cur === 'expertise' ? 'proficient' : cur))} /> Exp</label>
              </div>
              <div className="text-sm">{bonus >= 0 ? `+${bonus}` : `${bonus}`}</div>
            </div>
          );
        };

        return (
          <div className="space-y-1">
            {Object.keys(SKILL_MAP).map(k => renderSkillRow(k, k))}
          </div>
        );
      }

      return (
        <div className="space-y-4">
          {Object.entries(schema.fields).map(([k, subSchema]: any) => (
            <div key={k}>
              <label className="block font-semibold">{subSchema.label || k}</label>
              <RenderField
                schema={subSchema}
                value={value?.[k]}
                onChange={(val: any) => onChange({ ...value, [k]: val })}
                parentValue={parentValue || value}
              />
            </div>
          ))}
        </div>
      );
    case "list":
      {
        const list = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {list.map((item: any, i: number) => (
              <div key={i} className="flex space-x-2">
                {Object.entries(schema.itemFields).map(([ik, subSchema]: any) => (
                  <RenderField
                    key={ik}
                    schema={subSchema}
                    value={item[ik]}
                    onChange={(val: any) => {
                      const newList = [...list];
                      newList[i][ik] = val;
                      onChange(newList);
                    }}
                    parentValue={value}
                  />
                ))}
              </div>
            ))}
            <button
              className="bg-gray-200 px-2 py-1 rounded"
              onClick={() => onChange([...list, {}])}
            >
              + Add
            </button>
          </div>
        );
      }
    default:
      return null;
  }
}

