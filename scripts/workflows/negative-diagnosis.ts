import type { BaiduApiClient } from "../api/client.ts";
import { fetchAllReportRows } from "../reports/fetch.ts";

interface NegativeKeyword {
  negativeKeywordId: number;
  negativeKeyword?: string;
  campaignId?: number;
  adgroupId?: number;
  campaignName?: string;
  adgroupName?: string;
  negativeMatchType?: number;
  level?: number;
}

interface KeywordRow {
  campaignId?: number;
  campaignNameStatus?: string;
  adGroupId?: number;
  adGroupNameStatus?: string;
  wInfoId?: number;
  wInfoNameStatus?: string;
}

function normalize(value: string | undefined): string {
  return (value || "").replace(/\[已删除\]$/u, "").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

function applies(negative: NegativeKeyword, keyword: KeywordRow): boolean {
  if (negative.campaignId !== keyword.campaignId) return false;
  return negative.level === 3 || (negative.level === 5 && negative.adgroupId === keyword.adGroupId);
}

export async function diagnoseNegatives(input: {
  client: BaiduApiClient;
  userName: string;
  startDate: string;
  endDate: string;
}): Promise<Record<string, unknown>> {
  const [negativeResult, keywordReport] = await Promise.all([
    input.client.call<unknown, { data: NegativeKeyword[] }>("negative-keyword-get", input.userName, {
      negativeKeywordTypeFields: [
        "negativeKeyword", "negativeKeywordId", "campaignId", "adgroupId", "campaignName",
        "adgroupName", "negativeMatchType", "negativeKeywordPacketId", "level", "addTime", "modTime",
      ],
      orderBy: "negativeKeyword",
      fieldFilters: [],
      limit: [0, 5000],
      desc: true,
    }),
    fetchAllReportRows<KeywordRow>({ ...input, reportType: 2602783 }),
  ]);
  const negatives = negativeResult.data.data;
  const keywords = keywordReport.rows;
  const duplicateGroups = new Map<string, NegativeKeyword[]>();
  for (const negative of negatives) {
    const key = [negative.level, negative.campaignId, negative.adgroupId || 0, negative.negativeMatchType, normalize(negative.negativeKeyword)].join(":");
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), negative]);
  }
  const conflicts = [];
  for (const negative of negatives) {
    const negativeText = normalize(negative.negativeKeyword);
    if (!negativeText || negative.level === 33) continue;
    for (const keyword of keywords) {
      if (!applies(negative, keyword)) continue;
      const keywordText = normalize(keyword.wInfoNameStatus);
      const exact = negativeText === keywordText;
      const phraseOverlap = negative.negativeMatchType === 0 && keywordText.includes(negativeText);
      if (exact || phraseOverlap) conflicts.push({
        negativeKeywordId: negative.negativeKeywordId,
        negativeKeyword: negative.negativeKeyword,
        negativeMatchType: negative.negativeMatchType,
        level: negative.level,
        campaignId: keyword.campaignId,
        campaignName: keyword.campaignNameStatus,
        adGroupId: keyword.adGroupId,
        adGroupName: keyword.adGroupNameStatus,
        keywordId: keyword.wInfoId,
        keyword: keyword.wInfoNameStatus,
        signal: exact ? "exact_text_conflict" : "phrase_contains_negative",
      });
    }
  }

  return {
    coverage: { negativeKeywords: negatives.length, reportKeywords: keywords.length, keywordReportTruncated: keywordReport.truncated },
    duplicates: [...duplicateGroups.values()].filter(group => group.length > 1),
    possibleConflicts: conflicts,
    cautions: [
      "冲突基于文本和作用层级识别；修改前必须核对否定匹配语义及当前投放设置。",
      "关键词报表只包含所选周期有报表记录的关键词，不能证明未列出的关键词不存在。",
    ],
    automaticAction: false,
  };
}
