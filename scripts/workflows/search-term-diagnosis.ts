import type { BaiduApiClient } from "../api/client.ts";
import { fetchAllReportRows } from "../reports/fetch.ts";

interface SearchTermRow {
  campaignId?: number;
  campaignNameStatus?: string;
  adGroupId?: number;
  adGroupNameStatus?: string;
  wInfoId?: number;
  wInfoNameStatus?: string;
  queryWord?: string;
  wMatchId?: string;
  impression?: number;
  click?: number;
  cost?: number;
  conversion?: number;
  bridgeConversion?: number;
}

export async function diagnoseSearchTerms(input: {
  client: BaiduApiClient;
  userName: string;
  startDate: string;
  endDate: string;
  reviewCost?: number;
  maxRows?: number;
}): Promise<Record<string, unknown>> {
  const reviewCost = input.reviewCost ?? 20;
  const report = await fetchAllReportRows<SearchTermRow>({
    client: input.client,
    userName: input.userName,
    reportType: 2307838,
    startDate: input.startDate,
    endDate: input.endDate,
    ...(input.maxRows === undefined ? {} : { maxRows: input.maxRows }),
  });
  const rows = report.rows.map(row => ({
    ...row,
    impression: Number(row.impression || 0),
    click: Number(row.click || 0),
    cost: Number(row.cost || 0),
    conversion: Number(row.conversion || 0),
    bridgeConversion: Number(row.bridgeConversion || 0),
  }));
  const total = rows.reduce((sum, row) => ({
    impression: sum.impression + row.impression,
    click: sum.click + row.click,
    cost: sum.cost + row.cost,
    conversion: sum.conversion + row.conversion,
  }), { impression: 0, click: 0, cost: 0, conversion: 0 });
  const candidates = rows
    .filter(row => row.conversion === 0 && (row.cost >= reviewCost || row.click >= 2))
    .map(row => ({
      ...row,
      signals: [
        "zero_reported_conversion",
        ...(row.cost >= reviewCost ? ["cost_threshold"] : []),
        ...(row.click >= 2 ? ["repeated_clicks"] : []),
        ...(row.wMatchId?.includes("智能匹配") ? ["automatic_match"] : []),
        ...(row.wInfoNameStatus?.includes("已删除") ? ["deleted_keyword"] : []),
      ],
      recommendation: "人工核对搜索意图、CRM线索及产品相关性后，再决定是否添加否定词或收紧匹配。",
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    period: { startDate: input.startDate, endDate: input.endDate },
    coverage: { returnedRows: rows.length, totalRowCount: report.totalRowCount, truncated: report.truncated },
    totals: { ...total, ctr: total.impression ? total.click / total.impression : 0 },
    candidateRule: { reviewCost, minimumClicks: 2, automaticAction: false },
    candidates,
    warnings: total.cost > 0 && total.conversion === 0
      ? ["搜索词报表有消费但没有报告转化；候选项只能用于人工复核，不能据此自动否定。"]
      : [],
  };
}
