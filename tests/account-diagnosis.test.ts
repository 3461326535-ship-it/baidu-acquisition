import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseAccount } from "../scripts/workflows/account-diagnosis.ts";

test("combines structure, oCPC ownership, and account performance", async () => {
  let campaignCalls = 0;
  const fakeClient = {
    async call(action: string) {
      if (action === "account-get") return { data: { data: [{ userId: 1, balance: 500 }] } };
      if (action === "campaign-get") {
        campaignCalls += 1;
        return { data: { data: [
          { campaignId: 11, campaignName: "oCPC", status: 21, pause: false },
          { campaignId: 12, campaignName: "CPC", status: 23, pause: true },
        ] } };
      }
      if (action === "ocpc-target-package-list-get") return { data: { data: [{
        targetPackageId: 99,
        targetPackageName: "投放项目",
        ocpcBidType: 1,
        ocpcBid: 288,
        packageStatus: 4,
        ocpcStage: 1,
        transTypes: [120],
        scope: [{ levelId: 11, level: 2 }],
      }] } };
      if (action === "report-data-get") return { data: { data: [{ rows: [
        { date: "2026-11-01", cost: 100, impression: 1000, click: 20, cplConversions: 2 },
        { date: "2026-11-02", cost: 50, impression: 500, click: 10, cplConversions: 0 },
      ] }] } };
      throw new Error(`Unexpected action: ${action}`);
    },
  };

  const result = await diagnoseAccount({
    client: fakeClient as never,
    userName: "account",
    userId: 1,
    startDate: "2026-11-01",
    endDate: "2026-11-02",
  }) as any;

  assert.equal(campaignCalls, 2);
  assert.equal(result.structure.projectOcpcCampaigns, 1);
  assert.equal(result.structure.outsideProjectCampaigns, 1);
  assert.equal(result.structure.activeOutsideProjectCampaigns, 0);
  assert.equal(result.performance.cost, 150);
  assert.equal(result.performance.ctr, 0.02);
  assert.equal(result.performance.averageCpc, 5);
  assert.equal(result.performance.cpl, 75);
  assert.deepEqual(result.warnings, []);
});
