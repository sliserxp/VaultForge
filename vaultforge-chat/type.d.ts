declare global {
  interface Window {
    gptCore?: {
      chat: (
        messages: { role: "system" | "user" | "assistant"; content: string }[]
      ) => Promise<string>;
      embedMany: (texts: string[]) => Promise<number[][]>;
      embeddingDims?: number;
      embeddingModel?: string;
    };
  }
}

// API contract that GPT-Core exposes for other plugins
export interface GPTCoreAPI {
  chat(messages: { role: "system" | "user" | "assistant"; content: string }[]): Promise<string>;
  askVault(query: string): Promise<string>;
  askVaultConsise?(query: string): Promise<string>;
}


