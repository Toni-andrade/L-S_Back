import type { AddeparConfig } from "./config";
import { addeparRequest, type RequestOptions } from "./http";
import { transactionsQueryResponseSchema, type TransactionsQueryResponse } from "./schemas";

export type TransactionsQueryParams = {
  portfolioType: "ENTITY" | "GROUP" | "FIRM";
  portfolioId: number | number[];
  startDate: string;
  endDate: string;
  columns?: string[];
  limit?: number;
};

export const DEFAULT_TRANSACTION_COLUMNS = [
  "trade_date",
  "settle_date",
  "type",
  "description",
  "security",
  "units",
  "amount",
  "currency",
] as const;

/**
 * POST /v1/transactions/query (verified: no pagination on this endpoint; the
 * nightly sync bounds the window instead, with a 5-business-day overlap).
 */
export async function queryTransactions(
  config: AddeparConfig,
  params: TransactionsQueryParams,
  hooks?: Pick<RequestOptions, "fetchImpl" | "sleep">,
): Promise<TransactionsQueryResponse> {
  const raw = await addeparRequest(config, {
    method: "POST",
    path: "/v1/transactions/query",
    body: {
      data: {
        type: "transaction_query",
        attributes: {
          columns: params.columns ?? DEFAULT_TRANSACTION_COLUMNS,
          portfolio_type: params.portfolioType,
          portfolio_id: Array.isArray(params.portfolioId)
            ? params.portfolioId
            : [params.portfolioId],
          start_date: params.startDate,
          end_date: params.endDate,
          ...(params.limit ? { limit: params.limit } : {}),
        },
      },
    },
    ...hooks,
  });
  return transactionsQueryResponseSchema.parse(raw);
}

/** Maps Addepar transaction types onto the normalized activity enum. */
export function normalizeActivity(addeparType: string | null | undefined): string {
  const t = (addeparType ?? "").toLowerCase();
  if (t.includes("contribution") || t.includes("deposit")) return "contribution";
  if (t.includes("withdrawal") || t.includes("distribution")) return "withdrawal";
  if (t.includes("buy") || t.includes("purchase")) return "buy";
  if (t.includes("sell") || t.includes("sale")) return "sell";
  if (t.includes("dividend")) return "dividend";
  if (t.includes("interest") || t.includes("coupon")) return "interest";
  if (t.includes("fee") || t.includes("expense")) return "fee";
  if (t.includes("transfer")) return "transfer";
  return "other";
}
