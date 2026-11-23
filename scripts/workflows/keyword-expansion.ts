import type { BaiduApiClient } from "../api/client.ts";

export interface KrRow {
  word: string;
  competition?: number;
  recBid?: number;
  pcPV?: number;
  mobilePV?: number;
  pv?: number;
  show?: number;
  click?: number;
  showReasons?: string[];
  businessPoints?: string[];
  groupName?: string;
}

/**
 * Keyword Planner expansion. One seed per call; sleep between calls to stay
 * well below the KRService rate limit.
 */
export async function expandKeywords(input: {
  client: BaiduApiClient;
  userName: string;
  seeds: string[];
  maxNum?: number;
  device?: 0 | 1 | 2;
  delayMs?: number;
}): Promise<Record<string, KrRow[]>> {
  const maxNum = input.maxNum ?? 300;
  const device = input.device ?? 0;
  const delayMs = input.delayMs ?? 3000;
  const out: Record<string, KrRow[]> = {};
  for (let index = 0; index < input.seeds.length; index++) {
    const seed = input.seeds[index]!.trim();
    if (!seed) continue;
    if (index > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    const result = await input.client.call<unknown, { data: KrRow[] }>("kr-get", input.userName, {
      query: seed,
      seedFilter: { device, maxNum },
      queryType: 1,
    });
    out[seed] = result.data.data || [];
  }
  return out;
}
