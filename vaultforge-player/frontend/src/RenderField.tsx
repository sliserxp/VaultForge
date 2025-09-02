import React from "react";

export function RenderField({ schema, value, onChange }: any) {
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
      return (
        <input
          type="number"
          className="border p-1 w-24"
          value={value ?? 0}
          onChange={e => onChange(Number(e.target.value))}
        />
      );
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
      return (
        <div className="space-y-4">
          {Object.entries(schema.fields).map(([k, subSchema]: any) => (
            <div key={k}>
              <label className="block font-semibold">{subSchema.label || k}</label>
              <RenderField
                schema={subSchema}
                value={value?.[k]}
                onChange={(val: any) => onChange({ ...value, [k]: val })}
              />
            </div>
          ))}
        </div>
      );
    case "list":
      return (
        <div className="space-y-2">
          {(value || []).map((item: any, i: number) => (
            <div key={i} className="flex space-x-2">
              {Object.entries(schema.itemFields).map(([ik, subSchema]: any) => (
                <RenderField
                  key={ik}
                  schema={subSchema}
                  value={item[ik]}
                  onChange={(val: any) => {
                    const newList = [...value];
                    newList[i][ik] = val;
                    onChange(newList);
                  }}
                />
              ))}
            </div>
          ))}
          <button
            className="bg-gray-200 px-2 py-1 rounded"
            onClick={() => onChange([...(value || []), {}])}
          >
            + Add
          </button>
        </div>
      );
    default:
      return null;
  }
}

