import { z } from "zod";

/**
 * Contract verified against developers.addepar.com on 2026-07-13:
 * - POST /v1/portfolio/query (docs/portfolio-query)
 * - POST /v1/transactions/query (docs/transactions-query)
 * - GET  /v1/entities, /v1/groups (docs entities/groups, JSON:API)
 * - POST /v1/jobs + GET /v1/jobs/:id + GET /v1/jobs/:id/download (docs/jobs)
 * Schemas are intentionally permissive (passthrough) because column keys and
 * attribute sets are firm-configurable; raw payloads are always stored verbatim.
 */

// --- Portfolio Query -------------------------------------------------------

export const portfolioQueryRequestSchema = z.object({
  data: z.object({
    type: z.literal("portfolio_query"),
    attributes: z.object({
      columns: z.array(z.object({ key: z.string(), arguments: z.record(z.unknown()).optional() })),
      groupings: z.array(z.object({ key: z.string() })),
      portfolio_type: z.enum(["ENTITY", "GROUP", "FIRM"]),
      portfolio_id: z.array(z.number()).or(z.number()),
      start_date: z.string(),
      end_date: z.string(),
      filters: z
        .array(
          z.object({
            attribute: z.string(),
            type: z.string(),
            operator: z.string(),
            values: z.array(z.unknown()),
          }),
        )
        .optional(),
    }),
  }),
});
export type PortfolioQueryRequest = z.infer<typeof portfolioQueryRequestSchema>;

export type PortfolioViewNode = {
  name?: string | null;
  entity_id?: number | null;
  grouping?: string | null;
  columns?: Record<string, unknown>;
  children?: PortfolioViewNode[];
  [key: string]: unknown;
};

const portfolioViewNodeSchema: z.ZodType<PortfolioViewNode> = z.lazy(() =>
  z
    .object({
      name: z.string().nullish(),
      entity_id: z.number().nullish(),
      grouping: z.string().nullish(),
      columns: z.record(z.unknown()).optional(),
      children: z.array(portfolioViewNodeSchema).optional(),
    })
    .passthrough(),
);

export const portfolioQueryResponseSchema = z
  .object({
    meta: z
      .object({
        columns: z.array(z.unknown()).optional(),
        groupings: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    data: z
      .object({
        type: z.string(),
        attributes: z
          .object({
            total: portfolioViewNodeSchema.optional(),
            children: z.array(portfolioViewNodeSchema).optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
export type PortfolioQueryResponse = z.infer<typeof portfolioQueryResponseSchema>;

// --- Entities / Groups (JSON:API collections) -------------------------------

export const jsonApiResourceSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    type: z.string(),
    attributes: z.record(z.unknown()).default({}),
  })
  .passthrough();
export type JsonApiResource = z.infer<typeof jsonApiResourceSchema>;

export const jsonApiCollectionSchema = z
  .object({
    data: z.array(jsonApiResourceSchema),
    links: z.object({ next: z.string().nullish() }).passthrough().optional(),
  })
  .passthrough();
export type JsonApiCollection = z.infer<typeof jsonApiCollectionSchema>;

// --- Transactions Query ------------------------------------------------------

export const transactionsQueryResponseSchema = z
  .object({
    meta: z.object({ columns: z.array(z.unknown()).optional() }).passthrough().optional(),
    data: z.array(
      z
        .object({
          id: z.union([z.string(), z.number()]).transform(String),
          type: z.string().optional(),
          attributes: z.record(z.unknown()).default({}),
        })
        .passthrough(),
    ),
    links: z.object({ next: z.string().nullish() }).passthrough().optional(),
  })
  .passthrough();
export type TransactionsQueryResponse = z.infer<typeof transactionsQueryResponseSchema>;

// --- Jobs --------------------------------------------------------------------

export const jobResourceSchema = z
  .object({
    data: z
      .object({
        id: z.union([z.string(), z.number()]).transform(String),
        type: z.string().optional(),
        attributes: z
          .object({
            job_type: z.string().optional(),
            status: z.string().optional(),
            percent_complete: z.number().nullish(),
            errors: z.unknown().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
export type JobResource = z.infer<typeof jobResourceSchema>;
