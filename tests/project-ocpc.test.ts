import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseProjects } from "../scripts/workflows/project-ocpc.ts";

test("joins a target package to its campaigns", async () => {
  const fakeClient = {
    async call(action: string) {
      if (action === "campaign-get") {
        return { data: { data: [
          { campaignId: 11, campaignName: "A" },
          { campaignId: 12, campaignName: "B" },
        ] }, partial: false };
      }
      return { data: { data: [{
        targetPackageId: 99,
        targetPackageName: "投放项目",
        ocpcBidType: 1,
        ocpcBid: 288,
        packageStatus: 4,
        ocpcStage: 1,
        transTypes: [120],
        scope: [{ levelId: 11, level: 2 }, { levelId: 12, level: 2 }],
      }] }, partial: false };
    },
  };

  const result = await diagnoseProjects(fakeClient as never, "account", 1);
  assert.equal(result[0]?.projectId, 99);
  assert.equal(result[0]?.targetCpa, 288);
  assert.equal(result[0]?.conversionTypes[0]?.name, "综合线索收集");
  assert.deepEqual(result[0]?.campaigns.map(item => item.campaignId), [11, 12]);
});

