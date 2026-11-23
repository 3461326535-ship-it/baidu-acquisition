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
}

function normalize(value: string | undefined): string {
  return (value || "").replace(/\[已删除\]$/u, "").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set(value ? [value] : []);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  const intersection = [...a].filter(item => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export async function diagnoseMatchDeviation(input: {
  client: BaiduApiClient;
  userName: string;
  startDate: string;
  endDate: string;
  similarityThreshold?: number;
}): Promise<Record<string, unknown>> {
  const threshold = input.similarityThreshold ?? 0.2;
  const report = await fetchAllReportRows<SearchTermRow>({ ...input, reportType: 2307838 });
  const rows = report.rows.map(row => {
    const lexicalSimilarity = similarity(normalize(row.queryWord), normalize(row.wInfoNameStatus));
    const signals = [
      ...(row.wMatchId?.includes("智能匹配") ? ["automatic_match"] : []),
      ...(lexicalSimilarity < threshold ? ["low_lexical_similarity"] : []),
      ...(row.wInfoNameStatus?.includes("已删除") ? ["deleted_keyword"] : []),
    ];
    return { ...row, lexicalSimilarity, signals };
  });
  const candidates = rows
    .filter(row => row.signals.length > 0)
    .sort((a, b) => Number(b.cost || 0) - Number(a.cost || 0));

  return {
    period: { startDate: input.startDate, endDate: input.endDate },
    coverage: { returnedRows: rows.length, totalRowCount: report.totalRowCount, truncated: report.truncated },
    thresholds: { lexicalSimilarity: threshold, automaticAction: false },
    summary: {
      automaticMatchRows: rows.filter(row => row.signals.includes("automatic_match")).length,
      lowSimilarityRows: rows.filter(row => row.signals.includes("low_lexical_similarity")).length,
      deletedKeywordRows: rows.filter(row => row.signals.includes("deleted_keyword")).length,
      candidateRows: candidates.length,
    },
    candidates,
    cautions: ["文本相似度只能发现可能的错配，不能代替产品相关性判断。"],
  };
}
