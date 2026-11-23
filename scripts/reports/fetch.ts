import type { BaiduApiClient } from "../api/client.ts";
import type { ReportType, ReportTimeUnit } from "./registry.ts";
import { buildReportBody } from "./registry.ts";

interface ReportBlock<TRow> {
  rowCount?: number;
  totalRowCount?: number;
  rows?: TRow[];
}

export async function fetchAllReportRows<TRow>(input: {
  client: BaiduApiClient;
  userName: string;
  reportType: ReportType;
  startDate: string;
  endDate: string;
  timeUnit?: ReportTimeUnit;
  columns?: string[];
  pageSize?: number;
  maxRows?: number;
}): Promise<{ rows: TRow[]; totalRowCount: number; truncated: boolean }> {
  const pageSize = Math.min(Math.max(input.pageSize || 200, 1), 1000);
  const maxRows = Math.max(input.maxRows || 10_000, 1);
  const rows: TRow[] = [];
  let totalRowCount = 0;

  while (rows.length < maxRows) {
    const result = await input.client.call<unknown, { data: ReportBlock<TRow>[] }>(
      "report-data-get",
      input.userName,
      buildReportBody({
        reportType: input.reportType,
        startDate: input.startDate,
        endDate: input.endDate,
        timeUnit: input.timeUnit || "SUMMARY",
        ...(input.columns ? { columns: input.columns } : {}),
        startRow: rows.length,
        rowCount: Math.min(pageSize, maxRows - rows.length),
      }),
    );
    const block = result.data.data[0];
    const page = block?.rows || [];
    totalRowCount = block?.totalRowCount ?? Math.max(totalRowCount, rows.length + page.length);
    rows.push(...page);
    if (page.length === 0 || rows.length >= totalRowCount) break;
  }

  return { rows, totalRowCount, truncated: rows.length < totalRowCount };
}
