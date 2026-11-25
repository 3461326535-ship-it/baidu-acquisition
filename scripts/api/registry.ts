export type HttpMethod = "POST";

export interface ActionDefinition {
  endpoint: string;
  method: HttpMethod;
  qps: number;
  write?: boolean;
}

export const ACTIONS = {
  "account-get": {
    endpoint: "/json/sms/service/AccountService/getAccountInfo",
    method: "POST",
    qps: 50,
  },
  "campaign-get": {
    endpoint: "/json/sms/service/CampaignService/getCampaign",
    method: "POST",
    qps: 100,
  },
  "campaign-add": {
    endpoint: "/json/sms/service/CampaignService/addCampaign",
    method: "POST",
    qps: 10,
    write: true,
  },
  "adgroup-get": {
    endpoint: "/json/sms/service/AdgroupService/getAdgroup",
    method: "POST",
    qps: 100,
  },
  "adgroup-add": {
    endpoint: "/json/sms/service/AdgroupService/addAdgroup",
    method: "POST",
    qps: 10,
    write: true,
  },
  "ocpc-target-package-list-get": {
    endpoint: "/json/sms/service/OcpcService/getTargetPackageList",
    method: "POST",
    qps: 10,
  },
  // 2026-11-23 新增：oCPC 投放包（后台"项目"）建包写接口，走 guarded executor
  "ocpc-target-package-add": {
    endpoint: "/json/sms/service/OcpcService/addTargetPackage",
    method: "POST",
    qps: 10,
    write: true,
  },
  "report-data-get": {
    endpoint: "/json/sms/service/OpenApiReportService/getReportData",
    method: "POST",
    qps: 10,
  },
  "negative-keyword-get": {
    endpoint: "/json/sms/service/NegativeKeywordService/getNegativeKeyword",
    method: "POST",
    qps: 10,
  },
  "creative-get": {
    endpoint: "/json/sms/service/CreativeService/getCreative",
    method: "POST",
    qps: 100,
  },
  "creative-update": {
    endpoint: "/json/sms/service/CreativeService/updateCreative",
    method: "POST",
    qps: 10,
    write: true,
  },
  "creative-add": {
    endpoint: "/json/sms/service/CreativeService/addCreative",
    method: "POST",
    qps: 10,
    write: true,
  },
  "kr-get": {
    endpoint: "/json/sms/service/KRService/getKRByQuery",
    method: "POST",
    qps: 1,
  },
  "negative-keyword-add": {
    endpoint: "/json/sms/service/NegativeKeywordService/addNegativeKeyword",
    method: "POST",
    qps: 10,
    write: true,
  },
  "negative-keyword-delete": {
    endpoint: "/json/sms/service/NegativeKeywordService/deleteNegativeKeyword",
    method: "POST",
    qps: 10,
    write: true,
  },
  "keyword-add": {
    endpoint: "/json/sms/service/KeywordService/addWord",
    method: "POST",
    qps: 10,
    write: true,
  },
  "keyword-get": {
    endpoint: "/json/sms/service/KeywordService/getWord",
    method: "POST",
    qps: 100,
  },
  // 2026-11-24 新增：更新关键词（改出价/暂停/匹配）。官方文档 pageId=100272 nodeId=208，端点 KeywordService/updateWord。
  "keyword-update": {
    endpoint: "/json/sms/service/KeywordService/updateWord",
    method: "POST",
    qps: 10,
    write: true,
  },
  "keyword-delete": {
    endpoint: "/json/sms/service/KeywordService/deleteWord",
    method: "POST",
    qps: 10,
    write: true,
  },
  "campaign-update": {
    endpoint: "/json/sms/service/CampaignService/updateCampaign",
    method: "POST",
    qps: 10,
    write: true,
  },
  // 2026-11-25 新增：账户实时数据（todayTotalCost 今日累计消费），dev2.baidu.com pageId=100720 nodeId=266。
  // 报表 170026 当日滞后，实时接口是当天撞线口径的核对来源。
  "account-live-data-get": {
    endpoint: "/json/sms/service/LiveReportService/getAccountLiveData",
    method: "POST",
    qps: 10,
  },
} as const satisfies Record<string, ActionDefinition>;

export type ActionName = keyof typeof ACTIONS;

