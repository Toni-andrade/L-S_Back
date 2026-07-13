export type AddeparConfig = {
  subdomain: string;
  firmId: string;
  apiKey: string;
  apiSecret: string;
};

/** Returns null when Addepar is not configured (mock/dev mode). */
export function addeparConfigFromEnv(env: Record<string, string | undefined>): AddeparConfig | null {
  const subdomain = env.ADDEPAR_SUBDOMAIN;
  const firmId = env.ADDEPAR_FIRM_ID;
  const apiKey = env.ADDEPAR_API_KEY;
  const apiSecret = env.ADDEPAR_API_SECRET;
  if (!subdomain || !firmId || !apiKey || !apiSecret) return null;
  return { subdomain, firmId, apiKey, apiSecret };
}

export function baseUrl(config: AddeparConfig): string {
  return `https://${config.subdomain}.addepar.com/api`;
}
