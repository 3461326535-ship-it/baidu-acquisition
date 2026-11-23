export type ReportTimeUnit = "HOUR" | "DAY" | "WEEK" | "MONTH" | "SUMMARY";

export interface ReportDefinition {
  name: string;
  columns: readonly string[];
  defaultColumns: readonly string[];
  timeUnits: readonly ReportTimeUnit[];
}

export const REPORTS = {
  170026: {
    name: "搜索推广账户报告",
    columns: [
      "date", "userName", "cost", "impression", "click", "ctr",
      "cplConversions", "cplConversionsCost", "rfqConversions", "rfqConversionsCost",
    ],
    defaultColumns: [
      "date", "userName", "cost", "impression", "click", "ctr",
      "cplConversions", "cplConversionsCost",
    ],
    timeUnits: ["HOUR", "DAY", "WEEK", "MONTH", "SUMMARY"],
  },
  2290316: {
    name: "搜索推广计划报告",
    columns: [
      "date", "userName", "campaignId", "campaignNameStatus", "impression",
      "click", "cost", "ctr", "cpc", "conversion", "bridgeConversion",
    ],
    defaultColumns: [
      "date", "campaignId", "campaignNameStatus", "impression", "click", "cost", "ctr", "cpc",
    ],
    timeUnits: ["HOUR", "DAY", "WEEK", "MONTH", "SUMMARY"],
  },
  2284618: {
    name: "搜索推广单元报告",
    columns: [
      "date", "userName", "campaignId", "campaignNameStatus", "adGroupId",
      "adGroupNameStatus", "impression", "click", "cost", "ctr", "cpc", "conversion",
    ],
    defaultColumns: [
      "date", "campaignId", "campaignNameStatus", "adGroupId", "adGroupNameStatus",
      "impression", "click", "cost", "ctr", "cpc",
    ],
    timeUnits: ["HOUR", "DAY", "WEEK", "MONTH", "SUMMARY"],
  },
  2602783: {
    name: "搜索推广关键词报告",
    columns: [
      "date", "userName", "campaignId", "campaignNameStatus", "adGroupId",
      "adGroupNameStatus", "wInfoId", "wInfoNameStatus", "impression", "click",
      "cost", "ctr", "cpc", "conversion", "bridgeConversion", "bidNew", "qualityEnum", "avgRank",
    ],
    defaultColumns: [
      "date", "campaignId", "campaignNameStatus", "adGroupId", "adGroupNameStatus",
      "wInfoId", "wInfoNameStatus", "impression", "click", "cost", "ctr", "cpc", "avgRank",
    ],
    timeUnits: ["HOUR", "DAY", "WEEK", "MONTH", "SUMMARY"],
  },
  2307838: {
    name: "搜索词报告",
    columns: [
      "date", "campaignId", "campaignNameStatus", "adGroupId", "adGroupNameStatus",
      "wInfoId", "wInfoNameStatus", "queryWord", "queryStatusName", "wMatchId",
      "impression", "click", "cost", "ctr", "cpc", "conversion", "bridgeConversion",
    ],
    defaultColumns: [
      "date", "campaignId", "campaignNameStatus", "adGroupId", "adGroupNameStatus",
      "wInfoId", "wInfoNameStatus", "queryWord", "wMatchId", "impression", "click", "cost", "ctr", "cpc",
      "conversion", "bridgeConversion",
    ],
    timeUnits: ["DAY", "WEEK", "MONTH", "SUMMARY"],
  },
  // 2026-11-23 新增：落地页报告（转化事件）。线索API回传的百度标准转化事件（三句话咨询/留线索/电话拨通等）
  // 只记在 reportType 5381679，账户报告170026的 cpl/rfq 与 oCPC报告970638 的 detail 字段都读不到，
  // 之前诊断里 cplConversions=0 的告警因此是误报。字段口径来源：dev2《报告指标说明》转化字段表。
  // 注意：该报告不支持 HOUR；查询最早 2021-03-04，最大区间 731 天。
  5381679: {
    name: "搜索推广落地页报告（转化事件）",
    columns: [
      "date", "userName", "userId", "campaignId", "campaignNameStatus",
      "impression", "click", "cost",
      "ocpcConversionsDetail1", "ocpcConversionsDetail2", "ocpcConversionsDetail3",
      "ocpcConversionsDetail17", "ocpcConversionsDetail18", "ocpcConversionsDetail19",
      "ocpcConversionsDetail30", "ocpcConversionsDetail27", "ocpcConversionsDetail51",
      "ocpcConversionsDetail5", "ocpcConversionsDetail16", "ocpcConversionsDetail43",
      "ocpcLandingPageConversionsDetail99",
    ],
    // 2026-11-23 计划级 columns；账户级汇总请用 buildReportBody 时不带 campaignNameStatus，
    // 因部分转化（如本账户 11-11/11-17）只出现在账户汇总、无法归到具体投放计划。
    defaultColumns: [
      "date", "campaignNameStatus", "click", "cost",
      "ocpcConversionsDetail17", "ocpcConversionsDetail18", "ocpcConversionsDetail19",
      "ocpcConversionsDetail30",
    ],
    timeUnits: ["DAY", "WEEK", "MONTH", "SUMMARY"],
  },
} as const satisfies Record<number, ReportDefinition>;

// 2026-11-23 新增：标准转化事件字段 -> 可读名称（dev2《报告指标说明》转化字段表）
export const LEAD_CONVERSION_FIELDS = {
  ocpcConversionsDetail17: "三句话咨询量",
  ocpcConversionsDetail18: "留线索量",
  ocpcConversionsDetail19: "一句话咨询量(含三句话)",
  ocpcConversionsDetail30: "电话拨通量",
  ocpcConversionsDetail51: "有意向客户量",
  ocpcConversionsDetail27: "客户自定义转化量",
  ocpcConversionsDetail1: "咨询按钮点击量",
  ocpcConversionsDetail2: "电话按钮点击量",
  ocpcConversionsDetail3: "表单提交成功量",
  ocpcLandingPageConversionsDetail99: "其他转化量(落地页)",
} as const;

// 2026-11-23 口径修正：计入「线索转化合计」的字段必须去重——
// 19(一句话)已包含 17(三句话)，二者不能相加；1/2 是按钮点击属互动行为，不算线索。
export const LEAD_TOTAL_FIELDS = [
  "ocpcConversionsDetail17",
  "ocpcConversionsDetail18",
  "ocpcConversionsDetail30",
  "ocpcConversionsDetail51",
  "ocpcConversionsDetail27",
  "ocpcConversionsDetail3",
  "ocpcLandingPageConversionsDetail99",
] as const;
export const INTERACTION_FIELDS = ["ocpcConversionsDetail1", "ocpcConversionsDetail2"] as const;

export type ReportType = keyof typeof REPORTS;

export function buildReportBody(input: {
  reportType: ReportType;
  startDate: string;
  endDate: string;
  timeUnit?: ReportTimeUnit;
  columns?: string[];
  startRow?: number;
  rowCount?: number;
  needSum?: boolean;
}): Record<string, unknown> {
  const definition = REPORTS[input.reportType];
  const timeUnit = input.timeUnit || "DAY";
  if (!(definition.timeUnits as readonly string[]).includes(timeUnit)) {
    throw new Error(`${definition.name} does not support timeUnit ${timeUnit}.`);
  }
  const columns = input.columns || [...definition.defaultColumns];
  const unknown = columns.filter(column => !(definition.columns as readonly string[]).includes(column));
  if (unknown.length) {
    throw new Error(`Unsupported columns for ${definition.name}: ${unknown.join(", ")}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    throw new Error("Report dates must use YYYY-MM-DD.");
  }
  return {
    reportType: input.reportType,
    startDate: input.startDate,
    endDate: input.endDate,
    timeUnit,
    columns,
    sorts: [],
    filters: [],
    startRow: input.startRow || 0,
    rowCount: input.rowCount || 200,
    needSum: input.needSum ?? false,
  };
}

