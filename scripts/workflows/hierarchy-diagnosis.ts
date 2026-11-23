import type { BaiduApiClient } from "../api/client.ts";
import type { Campaign } from "../api/types.ts";
import { fetchAllReportRows } from "../reports/fetch.ts";

interface PerformanceRow {
  campaignId?: number;
  campaignNameStatus?: string;
  adGroupId?: number;
  adGroupNameStatus?: string;
  wInfoId?: number;
  wInfoNameStatus?: string;
  impression?: number;
  click?: number;
  cost?: number;
  conversion?: number;
}

function daysInclusive(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Invalid report date range.");
  return Math.floor((end - start) / 86_400_000) + 1;
}

function numberRows(rows: PerformanceRow[]): Array<PerformanceRow & { impression: number; click: number; cost: number; conversion: number }> {
  return rows.map(row => ({
    ...row,
    impression: Number(row.impression || 0),
    click: Number(row.click || 0),
    cost: Number(row.cost || 0),
    conversion: Number(row.conversion || 0),
  }));
}

export async function diagnoseHierarchy(input: {
  client: BaiduApiClient;
  userName: string;
  startDate: string;
  endDate: string;
  lowImpression?: number;
}): Promise<Record<string, unknown>> {
  const lowImpression = input.lowImpression ?? 10;
  const [campaignObjects, campaignReport, adgroupReport, keywordReport] = await Promise.all([
    input.client.call<unknown, { data: Campaign[] }>("campaign-get", input.userName, {
      campaignFields: ["campaignId", "campaignName", "budget", "pause", "status", "equipmentType"],
      campaignIds: [],
      adType: 0,
    }),
    fetchAllReportRows<PerformanceRow>({ ...input, reportType: 2290316 }),
    fetchAllReportRows<PerformanceRow>({ ...input, reportType: 2284618 }),
    fetchAllReportRows<PerformanceRow>({ ...input, reportType: 2602783 }),
  ]);
  const days = daysInclusive(input.startDate, input.endDate);
  const campaignRows = numberRows(campaignReport.rows);
  const adgroupRows = numberRows(adgroupReport.rows);
  const keywordRows = numberRows(keywordReport.rows);
  const reportByCampaign = new Map(campaignRows.map(row => [row.campaignId, row]));
  const campaigns = campaignObjects.data.data.map(campaign => {
    const row = reportByCampaign.get(campaign.campaignId);
    const dailyCost = Number(row?.cost || 0) / days;
    const budget = Number(campaign.budget || 0);
    return {
      ...campaign,
      impression: row?.impression || 0,
      click: row?.click || 0,
      cost: row?.cost || 0,
      dailyCost,
      budgetUtilization: budget > 0 ? dailyCost / budget : null,
      hasReportData: Boolean(row),
    };
  });

  return {
    period: { startDate: input.startDate, endDate: input.endDate, days },
    coverage: {
      campaignObjects: campaigns.length,
      campaignReportRows: campaignRows.length,
      adgroupReportRows: adgroupRows.length,
      keywordReportRows: keywordRows.length,
      truncated: campaignReport.truncated || adgroupReport.truncated || keywordReport.truncated,
    },
    campaigns,
    diagnostics: {
      activeCampaignsWithoutReportData: campaigns.filter(item => item.status === 21 && item.pause !== true && !item.hasReportData),
      budgetPressureCandidates: campaigns.filter(item => item.budgetUtilization !== null && item.budgetUtilization >= 0.85),
      zeroClickAdgroups: adgroupRows.filter(item => item.impression > 0 && item.click === 0),
      lowImpressionAdgroups: adgroupRows.filter(item => item.impression > 0 && item.impression <= lowImpression),
      zeroClickKeywords: keywordRows.filter(item => item.impression > 0 && item.click === 0),
      lowImpressionKeywords: keywordRows.filter(item => item.impression > 0 && item.impression <= lowImpression),
      spendingKeywordsWithoutReportedConversion: keywordRows
        .filter(item => item.cost > 0 && item.conversion === 0)
        .sort((a, b) => b.cost - a.cost),
    },
    thresholds: { lowImpression, budgetPressureRatio: 0.85, automaticAction: false },
  };
}
