import type { BaiduApiClient } from "../api/client.ts";
import type { Campaign, ProjectDiagnosis, TargetPackage } from "../api/types.ts";

const CONVERSION_TYPES: Record<number, string> = {
  1: "咨询按钮点击",
  2: "电话按钮点击",
  3: "表单提交成功",
  17: "三句话咨询",
  18: "留线索",
  19: "一句话咨询",
  30: "电话接通",
  35: "微信复制按钮点击",
  79: "微信加粉成功",
  92: "有效咨询",
  120: "综合线索收集",
};

const PACKAGE_STATUS: Record<number, string> = {
  0: "未生效",
  1: "投放前",
  2: "投放中（学习中）",
  3: "投放中（学习失败）",
  4: "投放中（学习完成）",
};

export async function diagnoseProjects(
  client: BaiduApiClient,
  userName: string,
  userId: number,
): Promise<ProjectDiagnosis[]> {
  const [campaignResult, packageResult] = await Promise.all([
    client.call<unknown, { data: Campaign[] }>("campaign-get", userName, {
      campaignFields: [
        "campaignId", "campaignName", "budget", "pause", "status", "adType",
        "businessPointName", "equipmentType", "campaignBidType", "campaignOcpcBidType",
      ],
      campaignIds: [],
      adType: 0,
    }),
    client.call<unknown, { data: TargetPackage[] }>("ocpc-target-package-list-get", userName, {
      targetPackageTypeFields: [
        "targetPackageId", "targetPackageName", "ocpcBid", "ocpcBidType", "scope",
        "dataFlowData", "packageStatus", "ocpcDeepCpa", "deepTypeStat",
        "deepTransTypeMode", "transAsset", "transAssetId",
      ],
      ids: [userId],
      level: 1,
    }),
  ]);

  const campaigns = campaignResult.data.data;
  const campaignById = new Map(campaigns.map(item => [item.campaignId, item]));
  return packageResult.data.data.map(pkg => {
    const campaignIds = (pkg.scope || []).map(item => item.levelId);
    const matched = campaignIds
      .map(id => campaignById.get(id))
      .filter((item): item is Campaign => Boolean(item))
      .map(item => ({ ...item, managedByProjectOcpc: true as const }));
    const unresolvedCampaignIds = campaignIds.filter(id => !campaignById.has(id));
    const conversionCodes = [...new Set([
      ...(pkg.transTypes || []),
      ...(pkg.dataFlowData || []).flatMap(item => item.transType || []),
    ])];

    return {
      projectId: pkg.targetPackageId,
      projectName: pkg.targetPackageName,
      bidMode: pkg.ocpcBidType === 1 ? "目标转化成本" :
        pkg.ocpcBidType === 2 ? "增强模式" : `未知(${pkg.ocpcBidType ?? "null"})`,
      targetCpa: typeof pkg.ocpcBid === "number" ? pkg.ocpcBid : null,
      status: PACKAGE_STATUS[pkg.packageStatus ?? -1] || `未知(${pkg.packageStatus ?? "null"})`,
      stage: pkg.ocpcStage === 1 ? "第一阶段" :
        pkg.ocpcStage === 2 ? "第二阶段" : `未知(${pkg.ocpcStage ?? "null"})`,
      conversionTypes: conversionCodes.map(code => ({
        code,
        name: CONVERSION_TYPES[code] || `未知转化类型(${code})`,
      })),
      campaigns: matched,
      unresolvedCampaignIds,
      raw: pkg,
    };
  });
}

