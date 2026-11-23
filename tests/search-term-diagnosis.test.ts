import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseSearchTerms } from "../scripts/workflows/search-term-diagnosis.ts";

test("paginates search terms and only emits review candidates", async () => {
  const starts: number[] = [];
  const fakeClient = {
    async call(_action: string, _userName: string, body: any) {
      starts.push(body.startRow);
      const all = [
        { queryWord: "相关词", wMatchId: "精确", impression: 20, click: 1, cost: 8, conversion: 1 },
        { queryWord: "待核对词", wMatchId: "自动定向(智能匹配)", impression: 5, click: 2, cost: 30 },
        { queryWord: "低消费词", wMatchId: "短语", impression: 4, click: 1, cost: 3 },
      ];
      return { data: { data: [{
        totalRowCount: all.length,
        rows: all.slice(body.startRow, body.startRow + body.rowCount),
      }] } };
    },
  };

  const result = await diagnoseSearchTerms({
    client: fakeClient as never,
    userName: "account",
    startDate: "2026-11-01",
    endDate: "2026-11-07",
    reviewCost: 20,
  }) as any;

  assert.deepEqual(starts, [0]);
  assert.equal(result.coverage.totalRowCount, 3);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].queryWord, "待核对词");
  assert.ok(result.candidates[0].signals.includes("automatic_match"));
  assert.equal(result.candidateRule.automaticAction, false);
});
