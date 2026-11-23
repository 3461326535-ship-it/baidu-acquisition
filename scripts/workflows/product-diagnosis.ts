import type { BaiduApiClient } from "../api/client.ts";
import type { Campaign } from "../api/types.ts";

export interface PriorityProduct {
  name: string;
  requiredTerms: string[];
  forbiddenTerms?: string[];
}

function includesTerm(value: string, term: string): boolean {
  return value.toLowerCase().includes(term.toLowerCase());
}

export async function diagnoseProducts(input: {
  client: BaiduApiClient;
  userName: string;
  products: PriorityProduct[];
}): Promise<Record<string, unknown>> {
  const result = await input.client.call<unknown, { data: Campaign[] }>("campaign-get", input.userName, {
    campaignFields: ["campaignId", "campaignName", "budget", "pause", "status", "equipmentType"],
    campaignIds: [],
    adType: 0,
  });
  const campaigns = result.data.data;
  const products = input.products.map(product => {
    const matches = campaigns.filter(campaign =>
      product.requiredTerms.some(term => includesTerm(campaign.campaignName, term)),
    );
    const forbiddenMatches = campaigns.filter(campaign =>
      (product.forbiddenTerms || []).some(term => includesTerm(campaign.campaignName, term)),
    );
    return {
      ...product,
      matchedCampaigns: matches,
      activeMatchedCampaigns: matches.filter(item => item.status === 21 && item.pause !== true),
      forbiddenMatches,
      status: matches.length === 0 ? "missing" :
        matches.some(item => item.status === 21 && item.pause !== true) ? "active" : "present_but_inactive",
    };
  });
  return {
    products,
    summary: {
      configuredProducts: products.length,
      active: products.filter(item => item.status === "active").length,
      missing: products.filter(item => item.status === "missing").length,
      inactive: products.filter(item => item.status === "present_but_inactive").length,
      productsWithForbiddenMatches: products.filter(item => item.forbiddenMatches.length > 0).length,
    },
    automaticAction: false,
  };
}
