"use server";

import { renderClientStatement, type StatementHolding } from "@ls/docgen";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

const PT_MONTHS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Generate a branded portfolio statement PPTX and store it as a client document. */
export async function generateClientStatement(formData: FormData): Promise<void> {
  const user = await requireUser();
  const clientId = uuid.parse(formData.get("clientId"));

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) throw new Error("client not found");

  const { data: snap } = await supabase
    .from("snapshots")
    .select("id, as_of")
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!snap) throw new Error("no snapshot available to report on");

  const { data: accts } = await supabase.from("accounts").select("id").eq("client_id", clientId);
  const accountIds = (accts ?? []).map((a) => a.id);
  if (accountIds.length === 0) throw new Error("client has no accounts");

  const { data: hold } = await supabase
    .from("holdings")
    .select("symbol, description, asset_class, market_value")
    .eq("snapshot_id", snap.id)
    .in("account_id", accountIds);
  const holdings: StatementHolding[] = (hold ?? [])
    .map((h) => ({
      symbol: h.symbol,
      description: h.description,
      assetClass: h.asset_class,
      marketValue: Number(h.market_value),
    }))
    .filter((h) => h.marketValue !== 0);
  if (holdings.length === 0) throw new Error("no holdings in the latest snapshot");

  const totalMv = holdings.reduce((s, h) => s + h.marketValue, 0);
  const byClass = new Map<string, number>();
  for (const h of holdings) {
    const k = h.assetClass ?? "Nao classificado";
    byClass.set(k, (byClass.get(k) ?? 0) + h.marketValue);
  }
  const allocation = [...byClass.entries()].map(([assetClass, marketValue]) => ({ assetClass, marketValue }));

  const [{ data: perf }, { data: act }] = await Promise.all([
    supabase
      .from("performance_points")
      .select("period, twr, as_of")
      .eq("scope", "client")
      .eq("scope_id", clientId)
      .order("as_of", { ascending: false }),
    supabase
      .from("portfolio_activity")
      .select("twr, change_in_value, market_change, net_flows, income, dividends")
      .eq("scope", "client")
      .eq("scope_id", clientId)
      .eq("period", "trailing_30d")
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const perfLabel: Record<string, string> = { ytd: "No ano (YTD)", one_year: "12 meses" };
  const seen = new Set<string>();
  const performance = (perf ?? [])
    .filter((p) => {
      if (seen.has(p.period)) return false;
      seen.add(p.period);
      return true;
    })
    .map((p) => ({ label: perfLabel[p.period] ?? p.period, twr: p.twr === null ? null : Number(p.twr) }));
  if (act) {
    performance.unshift({ label: "30 dias", twr: act.twr === null ? null : Number(act.twr) });
  }

  const d = new Date(snap.as_of);
  const monthYear = `${PT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  const { buffer } = await renderClientStatement({
    clientName: client.name,
    asOf: snap.as_of,
    monthYear,
    totalMv,
    allocation,
    performance,
    activity: act
      ? {
          changeInValue: act.change_in_value === null ? null : Number(act.change_in_value),
          marketChange: act.market_change === null ? null : Number(act.market_change),
          netFlows: act.net_flows === null ? null : Number(act.net_flows),
          income: act.income === null ? null : Number(act.income),
          dividends: act.dividends === null ? null : Number(act.dividends),
        }
      : null,
    holdings,
  });

  const fileName = `Relatorio ${client.name} ${monthYear}.pptx`;
  const key = `${clientId}/${crypto.randomUUID()}-statement.pptx`;
  const service = createServiceClient();
  const { error: upErr } = await service.storage.from("client-documents").upload(key, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    upsert: false,
  });
  if (upErr) throw new Error(`statement upload failed: ${upErr.message}`);

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      client_id: clientId,
      category: "statement",
      name: fileName,
      storage_path: key,
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size_bytes: buffer.length,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    await service.storage.from("client-documents").remove([key]);
    throw new Error(error.message);
  }

  await writeAudit({
    action: "report.statement",
    entityType: "documents",
    entityId: doc.id,
    after: { client_id: clientId, as_of: snap.as_of, holdings: holdings.length },
  });
  revalidatePath(`/clients/${clientId}`);
}
