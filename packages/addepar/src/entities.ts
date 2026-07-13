import type { AddeparConfig } from "./config";
import { addeparRequest, type RequestOptions } from "./http";
import { jsonApiCollectionSchema, type JsonApiResource } from "./schemas";

/** Enumerates a JSON:API collection following links.next until exhausted. */
async function listAll(
  config: AddeparConfig,
  path: string,
  hooks?: Pick<RequestOptions, "fetchImpl" | "sleep">,
): Promise<JsonApiResource[]> {
  const out: JsonApiResource[] = [];
  let next: string | null = path;
  while (next) {
    const raw = await addeparRequest(config, { method: "GET", path: next, ...hooks });
    const page = jsonApiCollectionSchema.parse(raw);
    out.push(...page.data);
    next = page.links?.next ?? null;
  }
  return out;
}

export function listEntities(
  config: AddeparConfig,
  hooks?: Pick<RequestOptions, "fetchImpl" | "sleep">,
): Promise<JsonApiResource[]> {
  return listAll(config, "/v1/entities", hooks);
}

export function listGroups(
  config: AddeparConfig,
  hooks?: Pick<RequestOptions, "fetchImpl" | "sleep">,
): Promise<JsonApiResource[]> {
  return listAll(config, "/v1/groups", hooks);
}
