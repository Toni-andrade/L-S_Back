import type { AddeparConfig } from "./config";
import { addeparRequest, type RequestOptions } from "./http";
import {
  portfolioQueryResponseSchema,
  type PortfolioQueryResponse,
  type PortfolioViewNode,
} from "./schemas";

export type PortfolioQueryParams = {
  portfolioType: "ENTITY" | "GROUP" | "FIRM";
  portfolioId: number | number[];
  startDate: string; // YYYY-MM-DD
  endDate: string;
  /** Firm-configurable column keys; defaults cover the nightly sync needs. */
  columns?: { key: string; arguments?: Record<string, unknown> }[];
  groupings?: { key: string }[];
};

export const DEFAULT_HOLDING_COLUMNS = [
  { key: "value" },
  { key: "units" },
  { key: "price" },
  { key: "asset_class" },
  { key: "currency" },
] as const;

export const DEFAULT_HOLDING_GROUPINGS = [
  { key: "holding_account" },
  { key: "position" },
] as const;

export async function runPortfolioQuery(
  config: AddeparConfig,
  params: PortfolioQueryParams,
  hooks?: Pick<RequestOptions, "fetchImpl" | "sleep">,
): Promise<PortfolioQueryResponse> {
  const raw = await addeparRequest(config, {
    method: "POST",
    path: "/v1/portfolio/query",
    body: {
      data: {
        type: "portfolio_query",
        attributes: {
          columns: params.columns ?? DEFAULT_HOLDING_COLUMNS,
          groupings: params.groupings ?? DEFAULT_HOLDING_GROUPINGS,
          portfolio_type: params.portfolioType,
          portfolio_id: Array.isArray(params.portfolioId)
            ? params.portfolioId
            : [params.portfolioId],
          start_date: params.startDate,
          end_date: params.endDate,
        },
      },
    },
    ...hooks,
  });
  return portfolioQueryResponseSchema.parse(raw);
}

export type FlattenedPosition = {
  /** Grouping path from root to leaf, e.g. [account name, position name]. */
  path: { name: string | null; entityId: number | null; grouping: string | null }[];
  columns: Record<string, unknown>;
  raw: PortfolioViewNode;
};

/**
 * Walks the grouped response tree and returns the leaf rows with their
 * grouping path. The sync layer maps path[0] (holding_account) to accounts
 * via addepar_entity_id and path[1] (position) to holdings rows.
 */
export function flattenPortfolioView(response: PortfolioQueryResponse): FlattenedPosition[] {
  const out: FlattenedPosition[] = [];
  const walk = (
    node: PortfolioViewNode,
    path: FlattenedPosition["path"],
  ) => {
    const entry = {
      name: node.name ?? null,
      entityId: node.entity_id ?? null,
      grouping: node.grouping ?? null,
    };
    const nextPath = [...path, entry];
    if (node.children && node.children.length > 0) {
      for (const child of node.children) walk(child, nextPath);
    } else {
      out.push({ path: nextPath, columns: node.columns ?? {}, raw: node });
    }
  };
  for (const child of response.data.attributes.children ?? []) walk(child, []);
  return out;
}
