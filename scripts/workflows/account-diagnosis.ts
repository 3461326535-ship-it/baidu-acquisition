import type { BaiduApiClient } from "../api/client.ts";
import type { Campaign } from "../api/types.ts";
// 2026-11-23 引入落地页报告线索字段：把线索转化纳入诊断，替代失效的 cpl 告警
import { buildReportBody, LEAD_CONVERSION_FIELDS, LEAD_TOTAL_FIELDS, INTERACTION_FIELDS } from "../reports/registry.ts";
import { diagnoseProjects } from "./project-ocpc.ts";

interface AccountRow {
  userId: number;
  balance?: number;
  pcBalance?: number;
  budget?: number;
  budgetType?: number;
  userStat?: number;
  regDomain?: string;
  liceName?: string;
}

interface ReportRow {
  date?: string;
  cost?: number;
  impression?: number;
  click?: number;
  cplConversions?: number;
}

// 2026-11-23 落地页报告行：线索API回传的标准转化事件字段
type LeadRow = Record<string, unknown> & {
  date?: string;
  campaignNameStatus?: string;
  click?: number;
  cost?: number;
};

interface ReportTotals {
  cost: number;
  impression: number;
  click: number;
  cplConversions: number;
  // 2026-11-23 各线索转化事件合计（key 为字段名）
  leadConversions: Record<string, number>;
}

export async function diagnoseAccount(input: {
  client: BaiduApiClient;
  userName: string;
  userId: number;
  startDate: string;
  endDate: string;
}): Promise<Record<string, unknown>> {
  const { client, userName, userId, startDate, endDate } = input;
  // 2026-11-23 新增落地页报告(5381679)查询：线索API标准转化事件只在这里有数。
  // 两路都要：账户级汇总拿到全部转化总量（部分转化无法归到具体计划），计划级用于定位来源。
  const leadEventColumns = Object.keys(LEAD_CONVERSION_FIELDS);
  const leadAccountColumns = ["date", "click", "cost", ...leadEventColumns];
  const leadCampaignColumns = ["date", "campaignNameStatus", "click", "cost", ...leadEventColumns];
  const [accountResult, campaignResult, projects, reportResult, leadAccountResult, leadCampaignResult] = await Promise.all([
    client.call<unknown, { data: AccountRow[] }>("account-get", userName, {
      accountFields: ["userId", "balance", "pcBalance", "budget", "budgetType", "userStat", "regDomain", "liceName"],
    }),
    client.call<unknown, { data: Campaign[] }>("campaign-get", userName, {
      campaignFields: ["campaignId", "campaignName", "budget", "pause", "status", "equipmentType"],
      campaignIds: [],
      adType: 0,
    }),
    diagnoseProjects(client, userName, userId),
    client.call<unknown, { data: Array<{ rows?: ReportRow[] }> }>(
      "report-data-get",
      userName,
      buildReportBody({ reportType: 170026, startDate, endDate }),
    ),
    client.call<unknown, { data: Array<{ rows?: LeadRow[] }> }>(
      "report-data-get",
      userName,
      buildReportBody({ reportType: 5381679, startDate, endDate, columns: leadAccountColumns }),
    ).catch(() => ({ data: { data: [] } })),
    client.call<unknown, { data: Array<{ rows?: LeadRow[] }> }>(
      "report-data-get",
      userName,
      buildReportBody({ reportType: 5381679, startDate, endDate, columns: leadCampaignColumns }),
    ).catch(() => ({ data: { data: [] } })),
  ]);

  const campaigns = campaignResult.data.data;
  const rows = reportResult.data.data.flatMap(block => block.rows || []);
  // 2026-11-23 总量以账户级汇总为准；计划级仅用于定位来源
  const leadRows = leadAccountResult.data.data.flatMap(block => block.rows || []);
  const leadCampaignRows = leadCampaignResult.data.data.flatMap(block => block.rows || []);
  // 2026-11-23 聚合线索转化：按事件字段累加，并保留可读名称
  const leadConversions = Object.fromEntries(
    Object.keys(LEAD_CONVERSION_FIELDS).map(field => [
      field,
      leadRows.reduce((sum, row) => sum + Number(row[field] || 0), 0),
    ]),
  );
  // 2026-11-23 合计口径：只累加去重后的线索事件，排除按钮点击(互动)与重复的一句话(19)
  const leadConversionTotal = LEAD_TOTAL_FIELDS.reduce(
    (sum, field) => sum + (leadConversions[field] || 0), 0,
  );
  const interactionTotal = INTERACTION_FIELDS.reduce(
    (sum, field) => sum + (leadConversions[field] || 0), 0,
  );
  const leadByCampaign = leadCampaignRows.reduce<Record<string, number>>((map, row) => {
    const name = String(row.campaignNameStatus || "未知");
    const n = LEAD_TOTAL_FIELDS.reduce((sum, field) => sum + Number(row[field] || 0), 0);
    if (n > 0) map[name] = (map[name] || 0) + n;
    return map;
  }, {});
  const totals = rows.reduce<ReportTotals>((sum, row) => ({
    cost: sum.cost + Number(row.cost || 0),
    impression: sum.impression + Number(row.impression || 0),
    click: sum.click + Number(row.click || 0),
    cplConversions: sum.cplConversions + Number(row.cplConversions || 0),
    leadConversions,
  }), { cost: 0, impression: 0, click: 0, cplConversions: 0, leadConversions });
  const ocpcCampaignIds = new Set(projects.flatMap(project => project.campaigns.map(item => item.campaignId)));
  const compactProjects = projects.map(({ raw: _raw, ...project }) => project);
  const outsideProjectCampaigns = campaigns.filter(item => !ocpcCampaignIds.has(item.campaignId));

  return {
    period: { startDate, endDate, returnedDays: rows.length },
    account: accountResult.data.data[0] || null,
    structure: {
      campaigns: campaigns.length,
      activeCampaigns: campaigns.filter(item => item.status === 21 && item.pause !== true).length,
      pausedCampaigns: campaigns.filter(item => item.pause === true || item.status === 23).length,
      projectOcpcCampaigns: ocpcCampaignIds.size,
      outsideProjectCampaigns: outsideProjectCampaigns.length,
      activeOutsideProjectCampaigns: outsideProjectCampaigns.filter(
        item => item.status === 21 && item.pause !== true,
      ).length,
      projects: compactProjects,
    },
    performance: {
      ...totals,
      ctr: totals.impression ? totals.click / totals.impression : 0,
      averageCpc: totals.click ? totals.cost / totals.click : 0,
      cpl: totals.cplConversions ? totals.cost / totals.cplConversions : null,
      // 2026-11-23 线索API标准转化事件的成本/合计
      leadConversionTotal,
      leadConversionCost: leadConversionTotal ? totals.cost / leadConversionTotal : null,
      interactionTotal,
      leadConversionsNamed: Object.fromEntries(
        Object.entries(LEAD_CONVERSION_FIELDS).map(([field, name]) => [name, leadConversions[field] || 0]),
      ),
      leadByCampaign,
    },
    warnings: [
      // 2026-11-23 修正：cplConversions 只覆盖 CPL/RFQ 特定产品口径，自定义线索事件恒为0，
      // 不能再据此告警。改看落地页报告的线索转化合计；只有两路都为0且确有消费才提示核对。
      ...(leadConversionTotal === 0 && totals.cplConversions === 0 && totals.cost > 0
        ? ["Both cplConversions and landing-page lead conversions are zero; verify conversion tracking and bd_vid attribution."]
        : []),
      ...(rows.length === 0 ? ["The report returned no rows for the selected period."] : []),
    ],
  };
}

