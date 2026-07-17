"use server";

import { z } from "zod";
import { aiComplete, type AiResult } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { flagsForScope, holdingsForScope, latestSnapshot, performanceSeries } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

type Draft = { text?: string; error?: string };

/**
 * All prompts share the same compliance frame: the model may ONLY use data we
 * pass in, never invent figures, and its output is always an internal DRAFT a
 * human edits before anything reaches a client.
 */
const GROUNDING_RULES =
  "Hard rules: use ONLY the facts and figures provided in the context; " +
  "never invent, estimate or extrapolate numbers, dates or holdings; " +
  "if a needed fact is missing, omit that topic rather than guessing. " +
  "The output is an internal draft that a human will edit before sending.";

async function audited(
  purpose: string,
  entityType: string,
  entityId: string,
  result: AiResult,
): Promise<Draft> {
  if ("error" in result) return { error: result.error };
  await writeAudit({
    action: "ai.suggest",
    entityType,
    entityId,
    after: { purpose, model: result.model, output_chars: result.text.length },
  });
  return { text: result.text };
}

/** Draft a reply for the ticket thread (internal tone, English). */
export async function suggestTicketReply(ticketId: string): Promise<Draft> {
  await requireUser();
  const id = uuid.parse(ticketId);
  const supabase = await createClient();

  const [{ data: t }, { data: events }, { data: canned }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, number, title, description, category, priority, status, client_id")
      .eq("id", id)
      .single(),
    supabase
      .from("ticket_events")
      .select("kind, body, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("canned_responses").select("title, body").eq("active", true).limit(5),
  ]);
  if (!t) return { error: "ticket not found" };

  const client = t.client_id
    ? (await supabase.from("clients").select("name").eq("id", t.client_id).single()).data
    : null;

  const thread = (events ?? [])
    .reverse()
    .map((e) => `[${e.kind}] ${e.body ?? ""}`)
    .join("\n");
  const styleExamples = (canned ?? []).map((c) => `- ${c.title}: ${c.body}`).join("\n");

  const result = await aiComplete({
    system:
      "You draft internal ticket replies for the operations desk of L&S Investment Advisors, " +
      `a registered investment advisor. Write in English, concise and professional. ${GROUNDING_RULES}`,
    user:
      `Ticket ${t.number} (${t.category}, priority ${t.priority}, status ${t.status})\n` +
      `Title: ${t.title}\n` +
      (t.description ? `Description: ${t.description}\n` : "") +
      (client ? `Related client: ${client.name}\n` : "") +
      `\nThread (oldest first):\n${thread || "(no comments yet)"}\n` +
      (styleExamples ? `\nHouse style examples:\n${styleExamples}\n` : "") +
      "\nDraft the next reply comment for this ticket. Reply text only, no preamble.",
    maxTokens: 700,
  });
  return audited("ticket_reply", "tickets", id, result);
}

const BRL_DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" });
const PT_CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const PT_PERCENT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const PT_RULES =
  "Escreva em portugues brasileiro, tom profissional e cordial. " +
  "Nao use travessoes nem hifens como pontuacao de frase. " +
  "Use os numeros exatamente como fornecidos no contexto, sem recalcular nem reformatar.";

/** Draft a client check-in message (Portuguese, client-facing after review). */
export async function suggestClientCheckin(clientId: string): Promise<Draft> {
  await requireUser();
  const id = uuid.parse(clientId);
  const supabase = await createClient();

  const [{ data: client }, { data: lastContact }, { data: activity }] = await Promise.all([
    supabase.from("clients").select("id, name, risk_profile, status").eq("id", id).single(),
    supabase
      .from("contacts")
      .select("type, subject, occurred_at")
      .eq("client_id", id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("portfolio_activity")
      .select("twr")
      .eq("scope", "client")
      .eq("scope_id", id)
      .eq("period", "trailing_30d")
      .maybeSingle(),
  ]);
  if (!client) return { error: "client not found" };

  const twr = activity?.twr === null || activity?.twr === undefined ? null : Number(activity.twr);
  const facts = [
    `Cliente: ${client.name}`,
    client.risk_profile ? `Perfil de risco: ${client.risk_profile}` : null,
    lastContact
      ? `Ultimo contato: ${lastContact.type} em ${BRL_DATE.format(new Date(lastContact.occurred_at))}${lastContact.subject ? ` (assunto: ${lastContact.subject})` : ""}`
      : "Ultimo contato: nao registrado",
    twr !== null ? `Variacao da carteira nos ultimos 30 dias: ${PT_PERCENT.format(twr)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await aiComplete({
    system:
      "Voce redige rascunhos de mensagens de relacionamento para assessores da L&S Investment Advisors. " +
      `${PT_RULES} ${GROUNDING_RULES}`,
    user:
      `Contexto:\n${facts}\n\n` +
      "Redija uma mensagem curta de check-in para o assessor enviar ao cliente " +
      "(WhatsApp ou e-mail), propondo uma conversa de acompanhamento. " +
      "Nao inclua saudacao de encerramento com nome do assessor. Apenas o texto da mensagem.",
    maxTokens: 500,
  });
  return audited("client_checkin", "clients", id, result);
}

/** Draft a portfolio revision narrative (Portuguese) from the live snapshot. */
export async function generatePortfolioRevision(
  scope: "household" | "client",
  scopeId: string,
): Promise<Draft> {
  await requireUser();
  const id = uuid.parse(scopeId);
  const supabase = await createClient();

  const snapshot = await latestSnapshot();
  if (!snapshot) return { error: "no portfolio snapshot yet (run an Addepar sync first)" };

  const [holdings, ytd, flags, nameRow] = await Promise.all([
    holdingsForScope(scope, id, snapshot.id),
    performanceSeries(scope, id, "ytd"),
    flagsForScope(scope, id),
    scope === "household"
      ? supabase.from("households").select("name").eq("id", id).single()
      : supabase.from("clients").select("name").eq("id", id).single(),
  ]);
  if (holdings.length === 0) return { error: "no holdings for this scope in the latest snapshot" };

  const total = holdings.reduce((s, h) => s + h.market_value, 0);
  const byClass = new Map<string, number>();
  for (const h of holdings) {
    const k = h.asset_class ?? "Outros";
    byClass.set(k, (byClass.get(k) ?? 0) + h.market_value);
  }
  const allocation = [...byClass.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${PT_PERCENT.format(v / total)} (${PT_CURRENCY.format(v)})`)
    .join("\n");
  const top = [...holdings]
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 10)
    .map(
      (h) =>
        `${h.symbol ?? h.description ?? "Posicao"}: ${PT_CURRENCY.format(h.market_value)} (${PT_PERCENT.format(h.market_value / total)})`,
    )
    .join("\n");
  const lastYtd = ytd.length ? ytd[ytd.length - 1] : null;
  const openFlags = flags
    .filter((f) => !f.acknowledged_at)
    .map((f) => `${f.severity}: ${f.message}`)
    .join("\n");

  const facts =
    `Nome: ${nameRow.data?.name ?? "Carteira"}\n` +
    `Data da posicao: ${BRL_DATE.format(new Date(snapshot.as_of))}\n` +
    `Patrimonio total: ${PT_CURRENCY.format(total)}\n` +
    (lastYtd
      ? `Rentabilidade no ano (TWR): ${PT_PERCENT.format(lastYtd.twr)}${lastYtd.benchmark_twr !== null ? ` | Benchmark: ${PT_PERCENT.format(lastYtd.benchmark_twr)}` : ""}\n`
      : "") +
    `\nAlocacao por classe de ativo:\n${allocation}\n` +
    `\nDez maiores posicoes:\n${top}\n` +
    (openFlags ? `\nPontos de atencao em aberto:\n${openFlags}\n` : "");

  const result = await aiComplete({
    system:
      "Voce redige rascunhos de revisao de carteira para assessores da L&S Investment Advisors. " +
      `${PT_RULES} ${GROUNDING_RULES} ` +
      "Estruture em secoes curtas: Visao geral, Alocacao, Desempenho, Pontos de atencao (se houver), Proximos passos sugeridos. " +
      "Termine com a linha: 'Rascunho gerado com assistencia de IA, sujeito a revisao do assessor.'",
    user: `Dados da carteira:\n${facts}\nRedija o rascunho da revisao.`,
    maxTokens: 1400,
  });
  return audited(
    "portfolio_revision",
    scope === "household" ? "households" : "clients",
    id,
    result,
  );
}
