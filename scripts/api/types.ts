export interface BaiduFailure {
  code?: number;
  message?: string;
  position?: number;
}

export interface BaiduHeader {
  status: number;
  desc?: string;
  succ?: number;
  oprs?: number;
  quota?: number;
  failures?: BaiduFailure[];
  traceid?: string;
}

export interface BaiduEnvelope<T = unknown> {
  header: BaiduHeader;
  body?: T;
}

export interface Credentials {
  appId?: string;
  secretKey?: string;
  accessToken: string;
  refreshToken?: string;
  authUserId?: string;
  expiresAt?: string;
  refreshExpiresAt?: string;
  tokenStorePath?: string;
}

export interface Campaign {
  campaignId: number;
  campaignName: string;
  pause?: boolean;
  status?: number;
  budget?: number;
  equipmentType?: number;
  campaignBidType?: number;
  campaignOcpcBidType?: number;
  businessPointName?: string;
}

export interface TargetPackageScope {
  levelId: number;
  level: number;
  planid?: number;
}

export interface TargetPackage {
  targetPackageId: number;
  targetPackageName: string;
  ocpcBidType?: number;
  ocpcBid?: number;
  packageStatus?: number;
  ocpcStage?: number;
  dataFlowData?: Array<{ dataFlow: number; transType: number[] }>;
  transTypes?: number[];
  scope?: TargetPackageScope[];
}

export interface ProjectDiagnosis {
  projectId: number;
  projectName: string;
  bidMode: string;
  targetCpa: number | null;
  status: string;
  stage: string;
  conversionTypes: Array<{ code: number; name: string }>;
  campaigns: Array<Campaign & { managedByProjectOcpc: true }>;
  unresolvedCampaignIds: number[];
  raw: TargetPackage;
}

