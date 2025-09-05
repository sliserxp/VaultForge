import json, re, os

INPUT_DIR = "./merged"
OUTPUT_DIR = "./cleaned"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --------------------------------------
# Currency conversion (to gp)
# --------------------------------------
CURRENCY_MAP = {"cp": 0.01, "sp": 0.1, "ep": 0.5, "gp": 1.0, "pp": 10.0}

# --------------------------------------
# Trait prereq mapping (expandable)
# --------------------------------------
TRAIT_PREREQS = {
    "Wing Attack": "Requires Flight/Wings trait",
    "Tail Sweep": "Requires Tail trait",
    "Multiattack": "Requires two natural weapon traits",
    "Breath Weapon": "Requires Dragon ancestry or elemental affinity"
}

# --------------------------------------
# Text helpers
# --------------------------------------
def strip_tags(text: str) -> str:
    return re.sub(r"\{@[^} ]+ ([^}]+)\}", r"\1", text)

def flatten_entries(entries):
    result = []
    for e in entries:
        if isinstance(e, str):
            result.append(strip_tags(e))
        elif isinstance(e, dict):
            if "entries" in e and isinstance(e["entries"], list):
                result.extend(flatten_entries(e["entries"]))
            elif "name" in e:
                result.append(strip_tags(e["name"]))
    return result

# --------------------------------------
# Value conversion
# --------------------------------------
def convert_value(val):
    if isinstance(val, (int, float)):
        return round(val / 100, 2)  # cp → gp
    if isinstance(val, dict):
        amt = val.get("amount", 0)
        unit = val.get("unit", "gp").lower()
        return round(amt * CURRENCY_MAP.get(unit, 1.0), 2)
    return 0.0

# --------------------------------------
# Strength evaluation
# --------------------------------------
def score_entry(entry: dict) -> int:
    score = 0
    rarity_map = {
        "common": 5, "uncommon": 15, "rare": 30,
        "very rare": 50, "legendary": 75, "artifact": 90
    }
    rarity = (entry.get("rarity") or "").lower()
    score += rarity_map.get(rarity, 0)

    desc = (entry.get("description") or "").lower()

    # Combat bonuses
    for b in re.findall(r"\+(\d) to attack", desc):
        score += 10 * int(b)
    for b in re.findall(r"\+(\d) to damage", desc):
        score += 8 * int(b)
    for b in re.findall(r"\+(\d) to ac", desc):
        score += 12 * int(b)

    for num, die in re.findall(r"(\d+)d(\d+)", desc):
        score += int(num) * 6

    if "resistance" in desc:
        score += 8
    if "immune" in desc or "immunity" in desc:
        score += 20

    if "advantage" in desc:
        score += 5
    if "fly speed" in desc or "flight" in desc:
        score += 15
    if "invisible" in desc:
        score += 15
    if "teleport" in desc:
        score += 15

    for lvl in re.findall(r"(\d)(?:st|nd|rd|th)-level spell", desc):
        score += 3 * int(lvl)
    if "at will" in desc:
        score += 10

    if entry.get("attunement"):
        score -= 5
    if "potion" in (entry.get("type") or "").lower() or "consumable" in (entry.get("type") or "").lower():
        score = max(1, score // 3)

    return max(1, min(score, 100))

# --------------------------------------
# Requirement builders
# --------------------------------------
def parse_feat_prereq(prereqs):
    out = []
    for req in prereqs:
        # Ability score prereqs
        if "ability" in req:
            for ab in req["ability"]:
                for ability, score in ab.items():
                    out.append(f"{ability.upper()} {score}+")
        # Another feat required
        if "feat" in req:
            out.append(f"Feat: {req['feat']}")
        # Race prereqs
        if "race" in req:
            races = req["race"]
            if isinstance(races, list):
                race_names = []
                for r in races:
                    if isinstance(r, dict):
                        # { "name": "Elf", "subrace": "High Elf" }
                        subrace = f" ({r['subrace']})" if "subrace" in r else ""
                        race_names.append(r["name"] + subrace)
                    else:
                        race_names.append(str(r))
                out.append("Race: " + ", ".join(race_names))
            elif isinstance(races, dict):
                subrace = f" ({races['subrace']})" if "subrace" in races else ""
                out.append(f"Race: {races['name']}{subrace}")
            else:
                out.append(f"Race: {str(races)}")
        # Class prereqs
        if "class" in req:
            cls = req["class"].get("name")
            lvl = req["class"].get("level", 1)
            out.append(f"{cls} level {lvl}+")
    return out


def build_requirements(raw, kind):
    reqs = []

    # Feats
    if kind.lower() == "feat" and "prerequisite" in raw and raw["prerequisite"]:
        reqs.extend(parse_feat_prereq(raw["prerequisite"]))

    # Class features
    if kind.lower() == "classfeature":
        if raw.get("class"):
            level = raw.get("level", 1)
            reqs.append(f"{raw['class']} level {level}+")
        if raw.get("subclass"):
            level = raw.get("level", 1)
            reqs.append(f"{raw['subclass']} subclass, level {level}+")

    # Spells
    if kind.lower() == "spell":
        if "level" in raw:
            reqs.append(f"Spell level {raw['level']}")
        if "classes" in raw:
            reqs.append("Available to: " + ", ".join(raw["classes"]))

    # Items (attunement)
    if raw.get("reqAttune"):
        reqs.append(f"Attunement: {raw['reqAttune']}")

    return "; ".join(reqs) if reqs else None

def build_monster_requirements(raw):
    reqs = []
    name = raw.get("traitName", "")
    if raw.get("legendary"):
        reqs.append("Requires Legendary status")
    if raw.get("lair"):
        reqs.append("Requires Lair trait unlocked")
    if name in TRAIT_PREREQS:
        reqs.append(TRAIT_PREREQS[name])
    return "; ".join(reqs) if reqs else None

# --------------------------------------
# Cleaning functions
# --------------------------------------
def clean_generic(data, kind):
    cleaned = []
    seen = set()
    for raw in data:
        name = raw.get("name")
        source = raw.get("source", "Unknown")
        key = (name, source)
        if key in seen:
            continue
        seen.add(key)

        desc = " ".join(flatten_entries(raw.get("entries", [])))
        entry = {
            "name": name,
            "type": raw.get("type", kind),
            "rarity": raw.get("rarity", "Common"),
            "attunement": raw.get("reqAttune") or None,
            "weight": raw.get("weight", 0),
            "source": source,
            "description": desc,
            "requirements": build_requirements(raw, kind)
        }

        base_value = convert_value(raw.get("value", 0))
        entry["strength"] = score_entry(entry)
        entry["value"] = base_value if base_value > 0 else round(entry["strength"] * 100, 2)

        cleaned.append(entry)
    return cleaned

def clean_monstertraits(data):
    cleaned = []
    for raw in data:
        desc = " ".join(flatten_entries(raw.get("entries", [])))
        entry = {
            "monster": raw.get("monster"),
            "traitName": raw.get("traitName"),
            "source": raw.get("source", "Unknown"),
            "description": desc,
            "requirements": build_monster_requirements(raw)
        }
        entry["strength"] = score_entry(entry)
        entry["value"] = round(entry["strength"] * 100, 2)
        cleaned.append(entry)
    return cleaned

# --------------------------------------
# Master run
# --------------------------------------
def process_file(name, kind, is_monster=False):
    infile = os.path.join(INPUT_DIR, f"{name}.json")
    outfile = os.path.join(OUTPUT_DIR, f"{name}_clean.json")

    if not os.path.exists(infile):
        print(f"⚠️ Skipped {infile} (missing)")
        return

    with open(infile, "r", encoding="utf-8") as f:
        data = json.load(f)

    if is_monster:
        cleaned = clean_monstertraits(data)
    else:
        cleaned = clean_generic(data, kind)

    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2, ensure_ascii=False)

    print(f"✅ Wrote {outfile} with {len(cleaned)} entries")

def main():
    targets = {
        "items": "Gear",
        "spells": "Spell",
        "feats": "Feat",
        "backgrounds": "Background",
        "races": "Race",
        "classfeatures": "ClassFeature",
    }
    for name, kind in targets.items():
        process_file(name, kind)

    process_file("monstertraits", "MonsterTrait", is_monster=True)

if __name__ == "__main__":
    main()
