#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { BaiduApiClient } from "./api/client.ts";
import { loadCredentials } from "./api/credentials.ts";
import { diagnoseProjects } from "./workflows/project-ocpc.ts";
import { diagnoseAccount } from "./workflows/account-diagnosis.ts";
import { diagnoseSearchTerms } from "./workflows/search-term-diagnosis.ts";
import { diagnoseHierarchy } from "./workflows/hierarchy-diagnosis.ts";
import { diagnoseMatchDeviation } from "./workflows/match-diagnosis.ts";
import { diagnoseNegatives } from "./workflows/negative-diagnosis.ts";
import { diagnoseProducts, type PriorityProduct } from "./workflows/product-diagnosis.ts";
import { dryRun, execute, type WritePlan } from "./api/writes.ts";
import { expandKeywords } from "./workflows/keyword-expansion.ts";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const [domain, command] = process.argv.slice(2, 4);
  const userName = option("--user-name") || process.env.BAIDU_USER_NAME;
  if (!userName) throw new Error("Missing --user-name or BAIDU_USER_NAME.");
  const client = new BaiduApiClient(await loadCredentials());

  if (domain === "account" && command === "get") {
    const result = await client.call("account-get", userName, {
      accountFields: ["userId", "balance", "pcBalance", "budget", "budgetType", "userStat", "regDomain", "cid", "liceName"],
    });
    console.log(JSON.stringify({ success: true, action: "account-get", ...result }, null, 2));
    return;
  }

  if (domain === "campaign" && command === "list") {
    const result = await client.call("campaign-get", userName, {
      campaignFields: ["campaignId", "campaignName", "budget", "pause", "status", "adType", "businessPointName", "equipmentType", "campaignBidType", "campaignOcpcBidType"],
      campaignIds: [],
      adType: 0,
    });
    console.log(JSON.stringify({ success: true, action: "campaign-get", ...result }, null, 2));
    return;
  }

  if (domain === "project" && command === "list" || domain === "diagnose" && command === "projects") {
    const rawUserId = option("--user-id");
    const userId = Number(rawUserId);
    if (!rawUserId || !Number.isSafeInteger(userId)) throw new Error("Missing valid --user-id.");
    const projects = await diagnoseProjects(client, userName, userId);
    console.log(JSON.stringify({ success: true, action: "diagnose-projects", data: projects }, null, 2));
    return;
  }

  if (domain === "diagnose" && command === "account") {
    const rawUserId = option("--user-id");
    const startDate = option("--start-date");
    const endDate = option("--end-date");
    const userId = Number(rawUserId);
    if (!rawUserId || !Number.isSafeInteger(userId)) throw new Error("Missing valid --user-id.");
    if (!startDate || !endDate) throw new Error("Missing --start-date or --end-date.");
    const data = await diagnoseAccount({ client, userName, userId, startDate, endDate });
    console.log(JSON.stringify({ success: true, action: "diagnose-account", data }, null, 2));
    return;
  }

  if (domain === "diagnose" && command === "search-terms") {
    const startDate = option("--start-date");
    const endDate = option("--end-date");
    if (!startDate || !endDate) throw new Error("Missing --start-date or --end-date.");
    const reviewCost = Number(option("--review-cost") || 20);
    const data = await diagnoseSearchTerms({ client, userName, startDate, endDate, reviewCost });
    console.log(JSON.stringify({ success: true, action: "diagnose-search-terms", data }, null, 2));
    return;
  }

  if (domain === "diagnose" && command === "hierarchy") {
    const startDate = option("--start-date");
    const endDate = option("--end-date");
    if (!startDate || !endDate) throw new Error("Missing --start-date or --end-date.");
    const data = await diagnoseHierarchy({ client, userName, startDate, endDate });
    console.log(JSON.stringify({ success: true, action: "diagnose-hierarchy", data }, null, 2));
    return;
  }

  if (domain === "diagnose" && command === "match-deviation") {
    const startDate = option("--start-date");
    const endDate = option("--end-date");
    if (!startDate || !endDate) throw new Error("Missing --start-date or --end-date.");
    const data = await diagnoseMatchDeviation({ client, userName, startDate, endDate });
    console.log(JSON.stringify({ success: true, action: "diagnose-match-deviation", data }, null, 2));
    return;
  }

  if (domain === "diagnose" && command === "negatives") {
    const startDate = option("--start-date");
    const endDate = option("--end-date");
    if (!startDate || !endDate) throw new Error("Missing --start-date or --end-date.");
    const data = await diagnoseNegatives({ client, userName, startDate, endDate });
    console.log(JSON.stringify({ success: true, action: "diagnose-negatives", data }, null, 2));
    return;
  }

  if (domain === "diagnose" && command === "products") {
    const productsFile = option("--products-file");
    if (!productsFile) throw new Error("Missing --products-file.");
    const products = JSON.parse(await readFile(productsFile, "utf8")) as PriorityProduct[];
    if (!Array.isArray(products) || products.length === 0) throw new Error("Products file must contain a non-empty JSON array.");
    const data = await diagnoseProducts({ client, userName, products });
    console.log(JSON.stringify({ success: true, action: "diagnose-products", data }, null, 2));
    return;
  }

  if (domain === "write" && command === "dry-run") {
    const planFile = option("--plan");
    if (!planFile) throw new Error("Missing --plan <write-plan.json>.");
    const plan = JSON.parse(await readFile(planFile, "utf8")) as WritePlan;
    if (!plan.userName || !Array.isArray(plan.operations)) {
      throw new Error("Plan must be { userName, operations[] }.");
    }
    plan.userName = plan.userName || userName;
    const preview = await dryRun(client, plan);
    console.log(JSON.stringify({ success: true, mode: "dry-run", ...preview }, null, 2));
    return;
  }

  if (domain === "write" && command === "execute") {
    const planFile = option("--plan");
    const confirmToken = option("--confirm");
    if (!planFile) throw new Error("Missing --plan <write-plan.json>.");
    const plan = JSON.parse(await readFile(planFile, "utf8")) as WritePlan;
    if (!plan.userName || !Array.isArray(plan.operations)) {
      throw new Error("Plan must be { userName, operations[] }.");
    }
    plan.userName = plan.userName || userName;
    const result = await execute(client, plan, confirmToken || "");
    console.log(JSON.stringify({ success: true, mode: "execute", ...result }, null, 2));
    return;
  }

  if (domain === "expand" && command === "keywords") {
    const seeds = (option("--seeds") || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!seeds.length) throw new Error("Missing --seeds \"词1,词2,...\".");
    const maxNum = Number(option("--max-num") || 300);
    const data = await expandKeywords({ client, userName, seeds, maxNum });
    console.log(JSON.stringify({ success: true, action: "expand-keywords", data }, null, 2));
    return;
  }

  throw new Error(`Unsupported command: ${domain || ""} ${command || ""}`.trim());
}

main().catch(error => {
  const safe = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ success: false, error: safe }, null, 2));
  process.exitCode = 1;
});

