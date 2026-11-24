import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BaiduApiClient } from "./client.ts";
import type { ActionName } from "./registry.ts";

/**
 * Guarded write executor.
 *
 * Every write follows the security workflow from references/security.md:
 *   1. build a plan (operations resolved to concrete Baidu IDs)
 *   2. dry-run: preview only, no write call is made
 *   3. explicit confirmation: caller must pass --confirm <token> printed by the dry-run
 *   4. execute
 *   5. verify by re-querying the affected objects
 *   6. append an audit record to the local audit log
 *
 * Operations may reference objects created earlier in the same plan (e.g. an
 * adgroup-add following a campaign-add). During dry-run those references render
 * as PENDING placeholders; during execute the created IDs are chained.
 */

export type NegativeMatch = "phrase" | "exact";
export type KeywordMatch = "exact" | "phrase";

export type WriteOperation =
  | {
      type: "negative-add";
      campaignName: string;
      words: Array<{ word: string; match: NegativeMatch }>;
    }
  | { type: "negative-delete"; ids: number[]; reason?: string }
  | {
      type: "keyword-add";
      /** Existing adgroup, or campaignName+adgroupName resolved at run time. */
      adgroupId?: number;
      campaignName?: string;
      adgroupName?: string;
      words: Array<{ word: string; match: KeywordMatch; price?: number }>;
      reason?: string;
    }
  | { type: "keyword-delete"; ids: number[]; reason?: string }
  // 2026-11-24 新增：更新关键词出价（批量）。 KeywordService/updateWord，body keywordTypes:[{keywordId,price}]。
  | {
      type: "keyword-price";
      prices: Array<{ keywordId: number; price: number }>;
      reason?: string;
    }
  | { type: "creative-pause"; ids: number[]; reason?: string }
  | {
      type: "creative-add";
      /** Existing adgroup, or campaignName+adgroupName resolved at run time. */
      adgroupId?: number;
      campaignName?: string;
      adgroupName?: string;
      title: string;
      description1: string;
      description2?: string;
      pcDestinationUrl?: string;
      pcDisplayUrl?: string;
      mobileDestinationUrl?: string;
      mobileDisplayUrl?: string;
      devicePreference?: number;
      reason?: string;
  }
  | {
      type: "campaign-add";
      campaignName: string;
      budget?: number;
      reason?: string;
    }
  | {
      type: "campaign-pause";
      campaignId: number;
      reason?: string;
    }
  | {
      type: "campaign-budget";
      campaignId: number;
      budget: number;
      reason?: string;
    }
  | {
      type: "adgroup-add";
      campaignName: string;
      adgroupName: string;
      maxPrice?: number;
      reason?: string;
    }
  // 2026-11-23 新增：新建 oCPC 投放包（后台"项目"）。dataFlow/transType 默认沿用账户现有包口径。
  | {
      type: "ocpc-package-add";
      packageName: string;
      campaignIds: number[];
      bidMode: 1 | 2; // 1 目标转化成本；2 增强模式（一阶段按原CPC出价）
      targetCpa?: number; // bidMode=1 必填
      dataFlow?: number; // 默认 1000（账户现有包口径）
      transTypes?: number[]; // 默认 [120] 综合线索收集
      marketingTargetId?: number; // 默认 7 销售线索
      reason?: string;
    };

export interface WritePlan {
  userName: string;
  operations: WriteOperation[];
}

const NEGATIVE_MATCH_CODE = { phrase: 0, exact: 63 } as const;
const KEYWORD_MATCH_CODE = { exact: 1, phrase: 2 } as const;

interface CampaignRef {
  campaignId: number;
  campaignName: string;
}

interface AdgroupRef {
  adgroupId: number;
  adgroupName: string;
  campaignId: number;
}

interface Call {
  action: ActionName;
  body: unknown;
  label: string;
}

export function planToken(plan: WritePlan): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ userName: plan.userName, operations: plan.operations }))
    .digest("hex");
  return hash.slice(0, 8).toUpperCase();
}

async function loadCampaigns(
  client: BaiduApiClient,
  userName: string,
): Promise<Map<string, number>> {
  const result = await client.call<unknown, { data: CampaignRef[] }>("campaign-get", userName, {
    campaignFields: ["campaignId", "campaignName"],
    campaignIds: [],
    adType: 0,
  });
  const map = new Map<string, number>();
  for (const row of result.data.data || []) {
    map.set(row.campaignName, row.campaignId);
    map.set(String(row.campaignId), row.campaignId);
  }
  return map;
}

async function loadAdgroups(
  client: BaiduApiClient,
  userName: string,
  campaignIds: number[],
): Promise<{ byName: Map<string, number>; byCampaign: Map<number, number[]> }> {
  const result = await client.call<unknown, { data: AdgroupRef[] }>("adgroup-get", userName, {
    adgroupFields: ["adgroupId", "adgroupName", "campaignId"],
    ids: campaignIds,
    idType: 3,
  });
  const byName = new Map<string, number>();
  const byCampaign = new Map<number, number[]>();
  for (const row of result.data.data || []) {
    byName.set(`${row.campaignId}:${row.adgroupName}`, row.adgroupId);
    byName.set(String(row.adgroupId), row.adgroupId);
    const list = byCampaign.get(row.campaignId) || [];
    list.push(row.adgroupId);
    byCampaign.set(row.campaignId, list);
  }
  return { byName, byCampaign };
}

interface RunState {
  campaigns: Map<string, number>;
  adgroups: Map<string, number>;
  campaignAdgroups: Map<number, number[]>;
  createdCampaigns: Map<string, number>;
  createdAdgroups: Map<string, number>;
}

function campaignIdOf(state: RunState, name: string): number | `PENDING:${string}` {
  return state.campaigns.get(name) ?? state.createdCampaigns.get(name) ?? `PENDING:${name}`;
}

function adgroupIdOf(state: RunState, op: { adgroupId?: number; campaignName?: string; adgroupName?: string }): number | `PENDING:${string}` {
  if (op.adgroupId !== undefined) return op.adgroupId;
  if (op.campaignName && op.adgroupName) {
    const campaignId = campaignIdOf(state, op.campaignName);
    if (typeof campaignId === "number") {
      const direct = state.adgroups.get(`${campaignId}:${op.adgroupName}`);
      if (direct !== undefined) return direct;
    }
    const created = state.createdAdgroups.get(`${op.campaignName}:${op.adgroupName}`);
    if (created !== undefined) return created;
    return `PENDING:${op.campaignName}:${op.adgroupName}`;
  }
  if (op.campaignName) {
    const campaignId = campaignIdOf(state, op.campaignName);
    if (typeof campaignId === "number") {
      const first = state.campaignAdgroups.get(campaignId)?.[0];
      if (first !== undefined) return first;
    }
    return `PENDING:${op.campaignName}:<first-adgroup>`;
  }
  throw new Error("keyword-add needs adgroupId, or campaignName (+ optional adgroupName).");
}

function opToCall(state: RunState, op: WriteOperation): Call {
  switch (op.type) {
    case "campaign-add":
      return {
        action: "campaign-add",
        label: `campaign-add:${op.campaignName}`,
        body: {
          campaignTypes: [{
            campaignName: op.campaignName,
            ...(op.budget !== undefined ? { budget: op.budget } : {}),
          }],
        },
      };
    case "campaign-pause":
      return {
        action: "campaign-update",
        label: `campaign-pause:${op.campaignId}`,
        body: { campaignTypes: [{ campaignId: op.campaignId, pause: true }] },
      };
    case "campaign-budget":
      return {
        action: "campaign-update",
        label: `campaign-budget:${op.campaignId}:${op.budget}`,
        body: { campaignTypes: [{ campaignId: op.campaignId, budget: op.budget }] },
      };
    case "adgroup-add": {
      return {
        action: "adgroup-add",
        label: `adgroup-add:${op.campaignName}/${op.adgroupName}`,
        body: {
          adgroupTypes: [{
            campaignId: campaignIdOf(state, op.campaignName),
            adgroupName: op.adgroupName,
            ...(op.maxPrice !== undefined ? { maxPrice: op.maxPrice } : {}),
          }],
        },
      };
    }
    case "negative-add": {
      const campaignId = campaignIdOf(state, op.campaignName);
      if (typeof campaignId !== "number") {
        throw new Error(`negative-add: campaign not found: ${op.campaignName}`);
      }
      return {
        action: "negative-keyword-add",
        label: `negative-add:${op.campaignName}`,
        body: {
          negativeKeywordTypes: op.words.map(w => ({
            negativeKeyword: w.word,
            campaignId,
            negativeMatchType: NEGATIVE_MATCH_CODE[w.match],
          })),
        },
      };
    }
    case "negative-delete":
      return {
        action: "negative-keyword-delete",
        label: `negative-delete:${op.ids.join(",")}`,
        body: { negativeKeywordIds: op.ids },
      };
    case "keyword-add": {
      const adgroupId = adgroupIdOf(state, op);
      return {
        action: "keyword-add",
        label: `keyword-add:${op.campaignName || op.adgroupId}`,
        body: {
          keywordTypes: op.words.map(w => ({
            keyword: w.word,
            adgroupId,
            matchType: KEYWORD_MATCH_CODE[w.match],
            ...(w.price !== undefined ? { price: w.price } : {}),
          })),
        },
      };
    }
    case "keyword-delete":
      return {
        action: "keyword-delete",
        label: `keyword-delete:${op.ids.join(",")}`,
        body: { keywordIds: op.ids },
      };
    // 2026-11-24 新增：批量改关键词出价
    case "keyword-price":
      return {
        action: "keyword-update",
        label: `keyword-price:${op.prices.length}条`,
        body: { keywordTypes: op.prices.map(p => ({ keywordId: p.keywordId, price: p.price })) },
      };
    case "ocpc-package-add":
      return {
        action: "ocpc-target-package-add",
        label: `ocpc-package-add:${op.packageName}`,
        body: {
          targetPackageType: [{
            targetPackageName: op.packageName,
            ocpcBidType: op.bidMode,
            ...(op.bidMode === 1 && op.targetCpa !== undefined ? { ocpcBid: op.targetCpa } : {}),
            scope: op.campaignIds.map(id => ({ levelId: id, level: 2 })),
            dataFlowData: [{
              dataFlow: op.dataFlow ?? 1000,
              transType: op.transTypes ?? [120],
            }],
            marketingTargetId: op.marketingTargetId ?? 7,
          }],
        },
      };
    case "creative-pause":
      return {
        action: "creative-update",
        label: `creative-pause:${op.ids.length}条`,
        body: { creativeTypes: op.ids.map(id => ({ creativeId: id, pause: true })) },
      };
    case "creative-add": {
      const campaignId = campaignIdOf(state, op.campaignName || "");
      const adgroupId = adgroupIdOf(state, op);
      return {
        action: "creative-add",
        label: `creative-add:${op.campaignName || op.adgroupId}:${op.title.slice(0, 16)}`,
        body: {
          creativeTypes: [{
            ...(typeof campaignId === "number" ? { campaignId } : {}),
            adgroupId,
            title: op.title,
            description1: op.description1,
            ...(op.description2 ? { description2: op.description2 } : {}),
            ...(op.pcDestinationUrl ? { pcDestinationUrl: op.pcDestinationUrl } : {}),
            ...(op.pcDisplayUrl ? { pcDisplayUrl: op.pcDisplayUrl } : {}),
            ...(op.mobileDestinationUrl ? { mobileDestinationUrl: op.mobileDestinationUrl } : {}),
            ...(op.mobileDisplayUrl ? { mobileDisplayUrl: op.mobileDisplayUrl } : {}),
            ...(op.devicePreference !== undefined ? { devicePreference: op.devicePreference } : {}),
          }],
        },
      };
    }
  }
}

function createdIdFrom(action: string, detail: unknown): { campaignId?: number; adgroupId?: number; campaignName?: string; adgroupName?: string } {
  const rows = (detail as { data?: Array<Record<string, unknown>> })?.data;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return {};
  const out: { campaignId?: number; adgroupId?: number; campaignName?: string; adgroupName?: string } = {};
  if (action === "campaign-add") {
    const cid = Number(row.campaignId);
    if (Number.isFinite(cid)) out.campaignId = cid;
    if (row.campaignName) out.campaignName = String(row.campaignName);
  }
  if (action === "adgroup-add") {
    const aid = Number(row.adgroupId);
    if (Number.isFinite(aid)) out.adgroupId = aid;
    if (row.adgroupName) out.adgroupName = String(row.adgroupName);
    const cid = Number(row.campaignId);
    if (Number.isFinite(cid)) out.campaignId = cid;
  }
  if (action === "creative-add") {
    const aid = Number(row.adgroupId);
    if (Number.isFinite(aid)) out.adgroupId = aid;
  }
  return out;
}

async function auditRecord(entry: Record<string, unknown>): Promise<void> {
  const dir = join(homedir(), ".baidu-acquisition");
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n";
  await appendFile(join(dir, "audit.jsonl"), line, { encoding: "utf8" });
}

/** Preview only. Sends read calls to resolve names, never write calls. */
export async function dryRun(
  client: BaiduApiClient,
  plan: WritePlan,
): Promise<{ token: string; calls: Array<{ action: ActionName; label: string; body: unknown }> }> {
  const campaigns = await loadCampaigns(client, plan.userName);
  const loaded = await loadAdgroups(client, plan.userName, [...campaigns.values()]);
  const state: RunState = {
    campaigns,
    adgroups: loaded.byName,
    campaignAdgroups: loaded.byCampaign,
    createdCampaigns: new Map(),
    createdAdgroups: new Map(),
  };
  const calls = plan.operations.map(op => {
    const call = opToCall(state, op);
    if (op.type === "campaign-add") {
      // Assume the campaign will exist for later ops; chain a synthetic id.
      state.createdCampaigns.set(op.campaignName, -1 - [...state.createdCampaigns.keys()].length);
    }
    if (op.type === "adgroup-add") {
      state.createdAdgroups.set(`${op.campaignName}:${op.adgroupName}`, -1);
    }
    return call;
  });
  return { token: planToken(plan), calls };
}

/** Execute a plan. Refuses to run without the token printed by dryRun(). */
export async function execute(
  client: BaiduApiClient,
  plan: WritePlan,
  confirmToken: string,
): Promise<{ token: string; results: Array<{ action: string; label: string; ok: boolean; detail: unknown }> }> {
  const token = planToken(plan);
  if (!confirmToken || confirmToken.trim().toUpperCase() !== token) {
    throw new Error(
      `Confirmation mismatch. Run the dry-run first and pass --confirm ${token} to execute.`,
    );
  }
  const campaigns = await loadCampaigns(client, plan.userName);
  const loaded = await loadAdgroups(client, plan.userName, [...campaigns.values()]);
  const state: RunState = {
    campaigns,
    adgroups: loaded.byName,
    campaignAdgroups: loaded.byCampaign,
    createdCampaigns: new Map(),
    createdAdgroups: new Map(),
  };
  const results: Array<{ action: string; label: string; ok: boolean; detail: unknown }> = [];
  for (const op of plan.operations) {
    let call: Call;
    try {
      call = opToCall(state, op);
    } catch (error) {
      results.push({ action: op.type, label: op.type, ok: false, detail: String(error) });
      continue;
    }
    try {
      const result = await client.callWrite(call.action, plan.userName, call.body);
      const ids = createdIdFrom(call.action, result.data);
      if (ids.campaignId !== undefined && ids.campaignId > 0) {
        const name = ids.campaignName || (op.type === "campaign-add" ? op.campaignName : undefined);
        if (name) {
          state.campaigns.set(name, ids.campaignId);
          state.createdCampaigns.set(name, ids.campaignId);
        }
      }
      if (ids.adgroupId !== undefined && ids.adgroupId > 0 && op.type === "adgroup-add") {
        state.adgroups.set(`${ids.campaignId}:${ids.adgroupName || op.adgroupName}`, ids.adgroupId);
        state.createdAdgroups.set(`${op.campaignName}:${op.adgroupName}`, ids.adgroupId);
      }
      results.push({ action: call.action, label: call.label, ok: true, detail: result.data });
    } catch (error) {
      results.push({ action: call.action, label: call.label, ok: false, detail: String(error) });
    }
  }
  const succeeded = results.filter(r => r.ok).length;
  await auditRecord({
    kind: "write-execute",
    userName: plan.userName,
    token,
    operations: plan.operations,
    succeeded,
    total: results.length,
  });
  return { token, results };
}
