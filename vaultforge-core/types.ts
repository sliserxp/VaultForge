/* ============ Shared Types for GPT Plugins ============ */

/* Vault index chunks */
export interface VaultIndexChunk {
  path: string;
  header: string;
  text: string;
  vec: number[];
}

export interface VaultIndex {
  version: number;
  model: string;
  dims: number;
  chunks: VaultIndexChunk[];
  lastBuiltAt?: number;
}

/* NPC definitions */
export interface NPC {
  id: string;
  name: string;
  race: string;
  profession: string;
  personality: string;
  faction: string;
  relationships: string[];
  voiceStyle?: string;
}

/* Dialogue turns */
export interface DialogueTurn {
  speaker: string;
  line: string;
}

/* Dialogue transcript */
export interface Dialogue {
  participants: string[];
  turns: DialogueTurn[];
}

/* Factions */
export interface Faction {
  id: string;
  name: string;
  description?: string;
  members?: string[]; // NPC ids
}

/* General GPT message structure */
export interface GPTMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

