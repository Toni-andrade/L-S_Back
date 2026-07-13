import type { AddeparConfig } from "./config";
import { AddeparApiError } from "./errors";
import { addeparRequest, type RequestOptions } from "./http";
import { jobResourceSchema, portfolioQueryResponseSchema, type PortfolioQueryResponse } from "./schemas";
import type { PortfolioQueryParams } from "./portfolio";
import { DEFAULT_HOLDING_COLUMNS, DEFAULT_HOLDING_GROUPINGS } from "./portfolio";

/**
 * Jobs API (verified): POST /v1/jobs with job_type PORTFOLIO_QUERY, poll
 * GET /v1/jobs/:id, then GET /v1/jobs/:id/download. Used for the firm-wide
 * nightly sync to avoid query timeouts; results are deleted by Addepar 24h
 * after creation, so downloads happen in the same run.
 */
export async function createPortfolioQueryJob(
  config: AddeparConfig,
  params: PortfolioQueryParams,
  hooks?: Pick<RequestOptions, "fetchImpl" | "sleep">,
): Promise<string> {
  const raw = await addeparRequest(config, {
    method: "POST",
    path: "/v1/jobs",
    body: {
      data: {
        type: "job",
        attributes: {
          job_type: "PORTFOLIO_QUERY",
          parameters: {
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
    },
    ...hooks,
  });
  return jobResourceSchema.parse(raw).data.id;
}

export async function getJobStatus(
  config: AddeparConfig,
  jobId: string,
  hooks?: Pick<RequestOptions, "fetchImpl" | "sleep">,
): Promise<{ status: string; percentComplete: number | null }> {
  const raw = await addeparRequest(config, { method: "GET", path: `/v1/jobs/${jobId}`, ...hooks });
  const job = jobResourceSchema.parse(raw);
  return {
    status: job.data.attributes.status ?? "Unknown",
    percentComplete: job.data.attributes.percent_complete ?? null,
  };
}

export async function downloadJobResult(
  config: AddeparConfig,
  jobId: string,
  hooks?: Pick<RequestOptions, "fetchImpl" | "sleep">,
): Promise<PortfolioQueryResponse> {
  const raw = await addeparRequest(config, {
    method: "GET",
    path: `/v1/jobs/${jobId}/download`,
    ...hooks,
  });
  return portfolioQueryResponseSchema.parse(raw);
}

const TERMINAL_FAILURE = new Set(["failed", "canceled", "cancelled", "error"]);

export async function runPortfolioQueryViaJob(
  config: AddeparConfig,
  params: PortfolioQueryParams,
  opts?: Pick<RequestOptions, "fetchImpl" | "sleep"> & {
    pollIntervalMs?: number;
    timeoutMs?: number;
  },
): Promise<PortfolioQueryResponse> {
  const pollInterval = opts?.pollIntervalMs ?? 5_000;
  const timeout = opts?.timeoutMs ?? 30 * 60_000;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const jobId = await createPortfolioQueryJob(config, params, opts);
  let elapsed = 0;
  for (;;) {
    const { status } = await getJobStatus(config, jobId, opts);
    const s = status.toLowerCase();
    if (s === "completed" || s === "complete" || s === "done") break;
    if (TERMINAL_FAILURE.has(s)) {
      throw new AddeparApiError(`Addepar job ${jobId} ${status}`, 0);
    }
    if (elapsed >= timeout) {
      throw new AddeparApiError(`Addepar job ${jobId} timed out after ${timeout}ms`, 0);
    }
    await sleep(pollInterval);
    elapsed += pollInterval;
  }
  return downloadJobResult(config, jobId, opts);
}
