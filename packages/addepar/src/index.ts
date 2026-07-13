/**
 * Addepar API client. Contract verified against developers.addepar.com
 * (2026-07-13): basic-authentication, portfolio-query, transactions-query,
 * jobs, entities. All raw payloads are stored verbatim by callers before
 * normalization; 403s on licensed attributes surface as AddeparLicenseError
 * for graceful degradation.
 */
export * from "./config";
export * from "./errors";
export * from "./http";
export * from "./schemas";
export * from "./portfolio";
export * from "./entities";
export * from "./transactions";
export * from "./jobs";
