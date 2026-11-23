import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseHierarchy } from "../scripts/workflows/hierarchy-diagnosis.ts";
import { diagnoseMatchDeviation } from "../scripts/workflows/match-diagnosis.ts";
import { diagnoseNegatives } from "../scripts/workflows/negative-diagnosis.ts";
import { diagnoseProducts } from "../scripts/workflows/product-diagnosis.ts";

function report(rows: unknown[]) {
  return { data: { data: [{ totalRowCount: rows.length, rows }] } };
}

test("finds hierarchy delivery issues without making changes", async () => {
  const fake = { async call(action: string, _user: string, body: any) {
    if (action === "campaign-get") return { data: { data: [
      { campaignId: 1, campaignName: "A", budget: 10, status: 21, pause: false },
      { campaignId: 2, campaignName: "B", budget: 10, status: 21, pause: false },
    ] } };
    if (body.reportType === 2290316) return report([{ campaignId: 1, impression: 10, click: 1, cost: 70 }]);
    if (body.reportType === 2284618) return report([{ campaignId: 1, adGroupId: 11, impression: 5, click: 0, cost: 0 }]);
    return report([{ campaignId: 1, adGroupId: 11, wInfoId: 111, impression: 2, click: 0, cost: 0 }]);
  } };
  const result = await diagnoseHierarchy({ client: fake as never, userName: "a", startDate: "2026-11-01", endDate: "2026-11-07" }) as any;
  assert.equal(result.diagnostics.activeCampaignsWithoutReportData.length, 1);
  assert.equal(result.diagnostics.budgetPressureCandidates.length, 1);
  assert.equal(result.diagnostics.zeroClickKeywords.length, 1);
  assert.equal(result.thresholds.automaticAction, false);
});

test("finds lexical match-deviation signals", async () => {
  const fake = { async call() { return report([
    { queryWord: "盐雾试验箱", wInfoNameStatus: "盐雾试验箱", wMatchId: "精确", cost: 1 },
    { queryWord: "完全不相关内容", wInfoNameStatus: "积分球", wMatchId: "自动定向(智能匹配)", cost: 5 },
  ]); } };
  const result = await diagnoseMatchDeviation({ client: fake as never, userName: "a", startDate: "2026-11-01", endDate: "2026-11-07" }) as any;
  assert.equal(result.summary.candidateRows, 1);
  assert.ok(result.candidates[0].signals.includes("automatic_match"));
  assert.ok(result.candidates[0].signals.includes("low_lexical_similarity"));
});

test("finds duplicate negatives and possible positive-keyword conflicts", async () => {
  const fake = { async call(action: string) {
    if (action === "negative-keyword-get") return { data: { data: [
      { negativeKeywordId: 1, negativeKeyword: "发生器", campaignId: 10, adgroupId: 0, level: 3, negativeMatchType: 0 },
      { negativeKeywordId: 2, negativeKeyword: "发 生 器", campaignId: 10, adgroupId: 0, level: 3, negativeMatchType: 0 },
    ] } };
    return report([{ campaignId: 10, adGroupId: 20, wInfoId: 30, wInfoNameStatus: "浪涌发生器" }]);
  } };
  const result = await diagnoseNegatives({ client: fake as never, userName: "a", startDate: "2026-11-01", endDate: "2026-11-07" }) as any;
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.possibleConflicts.length, 2);
  assert.equal(result.automaticAction, false);
});

test("checks required products without substituting forbidden models", async () => {
  const fake = { async call() { return { data: { data: [
    { campaignId: 1, campaignName: "LSG-1890B-型号试投", status: 21, pause: false },
    { campaignId: 2, campaignName: "LMS-6000便携光谱仪", status: 21, pause: false },
  ] } }; } };
  const result = await diagnoseProducts({
    client: fake as never,
    userName: "a",
    products: [{ name: "大型分布光度计", requiredTerms: ["LSG-1890"], forbiddenTerms: ["LMS-6000"] }],
  }) as any;
  assert.equal(result.summary.active, 1);
  assert.equal(result.summary.productsWithForbiddenMatches, 1);
  assert.equal(result.products[0].matchedCampaigns[0].campaignId, 1);
});
