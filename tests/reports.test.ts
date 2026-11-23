import assert from "node:assert/strict";
import test from "node:test";
import { buildReportBody } from "../scripts/reports/registry.ts";

test("builds a validated search-term report request", () => {
  const body = buildReportBody({
    reportType: 2307838,
    startDate: "2026-11-01",
    endDate: "2026-11-07",
    columns: ["date", "queryWord", "click", "cost"],
  });

  assert.equal(body.reportType, 2307838);
  assert.equal(body.timeUnit, "DAY");
  assert.deepEqual(body.columns, ["date", "queryWord", "click", "cost"]);
});

test("rejects unsupported report columns and time units", () => {
  assert.throws(() => buildReportBody({
    reportType: 2307838,
    startDate: "2026-11-01",
    endDate: "2026-11-07",
    columns: ["notARealColumn"],
  }), /Unsupported columns/);

  assert.throws(() => buildReportBody({
    reportType: 2307838,
    startDate: "2026-11-01",
    endDate: "2026-11-07",
    timeUnit: "HOUR",
  }), /does not support/);
});
