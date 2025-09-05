import os, json

# ===============================
# CONFIG
# ===============================
INPUT_DIR = "./"          # where the 5etools data/ folder is
OUTPUT_DIR = "./merged"   # where merged files will be written

# Categories we want to merge
CATEGORIES = {
    "item": "items.json",
    "spell": "spells.json",
    "race": "races.json",
    "background": "backgrounds.json",
    "feat": "feats.json",
    "optionalfeature": "optionalfeatures.json",
    "class": "classes.json",
    "subclass": "subclasses.json",
    "bestiary": "bestiary.json",
    "book": "books.json",
    "adventure": "adventures.json",
}

# ===============================
# HELPERS
# ===============================
def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def merge_category(category, outfile):
    merged = []
    for root, _, files in os.walk(INPUT_DIR):
        for fname in files:
            if fname.startswith(category) and fname.endswith(".json"):
                path = os.path.join(root, fname)
                try:
                    data = load_json(path)
                    if isinstance(data, dict):
                        for key, value in data.items():
                            if isinstance(value, list):
                                merged.extend(value)
                    elif isinstance(data, list):
                        merged.extend(data)
                except Exception as e:
                    print(f"⚠️ Skipped {path}: {e}")

    # Deduplicate by (name, source)
    seen = set()
    deduped = []
    for entry in merged:
        key = (entry.get("name"), entry.get("source"))
        if key not in seen:
            seen.add(key)
            deduped.append(entry)

    outpath = os.path.join(OUTPUT_DIR, outfile)
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(deduped, f, indent=2, ensure_ascii=False)
    print(f"✅ Wrote {outfile} with {len(deduped)} entries")
    return deduped

# ===============================
# MAIN
# ===============================
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    merged_data = {}

    # Step 1: Merge core categories
    for category, outfile in CATEGORIES.items():
        merged_data[category] = merge_category(category, outfile)

    # Step 2: Extract class + subclass features
    class_features = []
    for cls in merged_data.get("class", []):
        for lvl in cls.get("classFeatures", []):
            if not isinstance(lvl, dict):
                continue
            for f in lvl.get("entries", []):
                if isinstance(f, dict):
                    class_features.append({
                        "class": cls.get("name"),
                        "featureName": f.get("name"),
                        "entries": f.get("entries"),
                        "level": lvl.get("level"),
                        "source": cls.get("source"),
                    })

    for sc in merged_data.get("subclass", []):
        for lvl in sc.get("subclassFeatures", []):
            if not isinstance(lvl, dict):
                continue
            for f in lvl.get("entries", []):
                if isinstance(f, dict):
                    class_features.append({
                        "subclass": sc.get("name"),
                        "featureName": f.get("name"),
                        "entries": f.get("entries"),
                        "level": lvl.get("level"),
                        "source": sc.get("source"),
                    })

    outpath = os.path.join(OUTPUT_DIR, "classfeatures.json")
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(class_features, f, indent=2, ensure_ascii=False)
    print(f"✅ Wrote classfeatures.json with {len(class_features)} features")

    # Step 3: Extract monster traits
    monster_traits = []
    for mon in merged_data.get("bestiary", []):
        # Standard traits
        for t in mon.get("trait", []):
            if isinstance(t, dict):
                monster_traits.append({
                    "monster": mon.get("name"),
                    "traitName": t.get("name"),
                    "entries": t.get("entries"),
                    "source": mon.get("source"),
                })
        # Legendary actions
        for la in mon.get("legendary", []):
            if isinstance(la, dict):
                monster_traits.append({
                    "monster": mon.get("name"),
                    "traitName": la.get("name"),
                    "entries": la.get("entries"),
                    "legendary": True,
                    "source": mon.get("source"),
                })
        # Lair actions
        for la in mon.get("lairActions", []):
            if isinstance(la, dict):
                monster_traits.append({
                    "monster": mon.get("name"),
                    "traitName": la.get("name", "Lair Action"),
                    "entries": la.get("entries"),
                    "lair": True,
                    "source": mon.get("source"),
                })

    outpath = os.path.join(OUTPUT_DIR, "monstertraits.json")
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(monster_traits, f, indent=2, ensure_ascii=False)
    print(f"✅ Wrote monstertraits.json with {len(monster_traits)} traits")

if __name__ == "__main__":
    main()
