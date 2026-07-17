"use server";

import { z } from "zod";
import { aiSearchComplete } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import {
  advisorCenter,
  flagsForScope,
  holdingsForScope,
  performanceSeries,
  transactionsForScope,
  workQueue,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

type Draft = { text?: string; cached?: boolean; error?: string };

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
const PT_DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

const HARD_RULES =
  "Regras rigidas: numeros, posicoes e datas da carteira vem EXCLUSIVAMENTE do bloco de dados fornecido; " +
  "nunca calcule, estime ou invente valores. Fatos de mercado vem EXCLUSIVAMENTE da busca na web feita agora; " +
  "cada afirmacao de mercado deve citar a fonte entre parenteses e as URLs devem aparecer numa secao final Fontes. " +
  "Se nao houver resultado de busca relevante para um tema, nao comente esse tema. " +
  "Nunca recomende compra ou venda de um ativo especifico; aponte o fato e formule a pergunta que o assessor deve se fazer. " +
  "Nao use travessoes como pontuacao. Nao use markdown; use titulos de secao em texto simples terminados em dois pontos.";

async function cacheAndAudit(
  kind: "advisor_daily" | "client_weekly",
  scopeKey: string,
  userId: string,
  result: Awaited<ReturnType<typeof aiSearchComplete>>,
): Promise<Draft> {
  if ("error" in result) return { error: result.error };
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("ai_snapshots").upsert(
    {
      kind,
      scope_key: scopeKey,
      as_of: today,
      content: result.text,
      model: result.model,
      created_by: userId,
    },
    { onConflict: "kind,scope_key,as_of,created_by" },
  );
  if (error) console.error("ai_snapshots upsert failed", error.message);
  await writeAudit({
    action: "ai.suggest",
    entityType: "ai_snapshots",
    entityId: null,
    after: { purpose: kind, scope_key: scopeKey, model: result.model, output_chars: result.text.length },
  });
  return { text: result.text };
}

async function readCache(
  kind: "advisor_daily" | "client_weekly",
  scopeKey: string,
): Promise<string | null> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("ai_snapshots")
    .select("content")
    .eq("kind", kind)
    .eq("scope_key", scopeKey)
    .eq("as_of", today)
    .maybeSingle();
  return data?.content ?? null;
}

/**
 * Advisor daily brief: "my day" across the whole visible book. Grounded in
 * the work queue, the advisor-center aggregates and day-over-day snapshot
 * movement; market context via cited web search.
 */
export async function generateAdvisorDaily(force: boolean): Promise<Draft> {
  const user = await requireUser();
  if (!force) {
    const cached = await readCache("advisor_daily", user.id);
    if (cached) return { text: cached, cached: true };
  }

  const supabase = await createClient();
  const [center, queue, { data: snaps }] = await Promise.all([
    advisorCenter(),
    workQueue(user),
    supabase.from("snapshots").select("id, as_of").order("as_of", { ascending: false }).limit(2),
  ]);

  // Day-over-day book movement from the last two snapshots.
  let movement = "Sem snapshot anterior para comparar.";
  let assetMix = "";
  const topSymbols: string[] = [];
  const nowSnapRow = snaps?.[0];
  const prevSnapRow = snaps?.[1];
  if (nowSnapRow) {
    const { data: hrows } = await supabase
      .from("holdings")
      .select("snapshot_id, symbol, description, asset_class, market_value")
      .in(
        "snapshot_id",
        (snaps ?? []).map((s) => s.id),
      );
    const nowId = nowSnapRow.id;
    let totalNow = 0;
    let totalPrev = 0;
    const bySymbolNow = new Map<string, number>();
    const bySymbolPrev = new Map<string, number>();
    const byClass = new Map<string, number>();
    for (const h of hrows ?? []) {
      const mv = Number(h.market_value);
      const key = h.symbol ?? h.description ?? "Outros";
      if (h.snapshot_id === nowId) {
        totalNow += mv;
        bySymbolNow.set(key, (bySymbolNow.get(key) ?? 0) + mv);
        const cls = h.asset_class ?? "Outros";
        byClass.set(cls, (byClass.get(cls) ?? 0) + mv);
      } else {
        totalPrev += mv;
        bySymbolPrev.set(key, (bySymbolPrev.get(key) ?? 0) + mv);
      }
    }
    const movers = [...bySymbolNow.entries()]
      .map(([k, v]) => ({ k, delta: v - (bySymbolPrev.get(k) ?? 0) }))
      .filter((m) => Math.abs(m.delta) >= 500)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);
    const delta = totalPrev > 0 ? totalNow - totalPrev : null;
    movement =
      `Book em ${PT_CURRENCY.format(totalNow)} (posicao de ${nowSnapRow.as_of})` +
      (delta !== null && prevSnapRow
        ? `, variacao de ${PT_CURRENCY.format(delta)} (${PT_PERCENT.format(totalPrev ? delta / totalPrev : 0)}) desde ${prevSnapRow.as_of}.`
        : ".") +
      (movers.length
        ? `\nMaiores movimentos por posicao: ${movers.map((m) => `${m.k} ${PT_CURRENCY.format(m.delta)}`).join("; ")}`
        : "");
    assetMix = [...byClass.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${PT_PERCENT.format(totalNow ? v / totalNow : 0)}`)
      .join(", ");
    topSymbols.push(
      ...[...bySymbolNow.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k]) => k),
    );
  }

  const attention = queue.clientActions
    .slice(0, 12)
    .map((a) => `- [${a.severity}] ${a.title} (${a.subtitle})`)
    .join("\n");
  const agenda = [
    ...center.redemptions
      .slice(0, 6)
      .map(
        (r) =>
          `- Vencimento ${PT_DATE.format(new Date(r.maturityDate))}: ${r.symbol ?? r.description ?? "titulo"} de ${r.name} (${PT_CURRENCY.format(r.value)})`,
      ),
    ...center.agingCash
      .slice(0, 5)
      .map(
        (c) =>
          `- Caixa parado: ${c.name} com ${PT_CURRENCY.format(c.cash)} (${PT_PERCENT.format(c.pct)} da carteira)`,
      ),
    ...center.newDeposits
      .slice(0, 5)
      .map((d) => `- Deposito novo: ${d.name} ${PT_CURRENCY.format(d.amount)} em ${PT_DATE.format(new Date(d.trade_date))}`),
    ...center.openings.map((o) => `- Abertura de conta em andamento: ${o.title} (${o.status})`),
  ].join("\n");

  const facts =
    `Data: ${PT_DATE.format(new Date())}\n\nMovimento do book:\n${movement}\n` +
    (assetMix ? `\nAlocacao do book por classe: ${assetMix}\n` : "") +
    `\nPrecisa de atencao (fila priorizada):\n${attention || "- Nada pendente"}\n` +
    `\nAgenda e fatos do book:\n${agenda || "- Sem itens"}\n`;

  const result = await aiSearchComplete({
    system:
      "Voce prepara o briefing diario interno de um assessor da L&S Investment Advisors sobre TODO o book dele. " +
      "Escreva em portugues brasileiro, direto e objetivo, em tom de colega para colega. " +
      HARD_RULES +
      " Estrutura da resposta: Meu dia: (2 a 3 frases, como o book amanheceu e o item mais urgente). " +
      "Precisa de atencao hoje: (itens na ordem de urgencia). " +
      "Movimentos no book: (clientes e posicoes que mais variaram, depositos, caixa parado). " +
      "Agenda: (vencimentos, resgates, aberturas em andamento). " +
      "Contexto de mercado: (fatos das ultimas 24 horas ligados as classes de ativos do book, com fontes). " +
      "Se eu fizer so uma coisa hoje: (uma frase). Fontes: (URLs).",
    user:
      `Dados do book:\n${facts}\n` +
      `Pesquise na web noticias de mercado das ultimas 24 horas relevantes para estas classes de ativos e posicoes: ${assetMix || "renda fixa e acoes globais"}${topSymbols.length ? `; principais posicoes: ${topSymbols.join(", ")}` : ""}. ` +
      "Depois redija o briefing.",
    maxTokens: 2500,
  });
  return cacheAndAudit("advisor_daily", user.id, user.id, result);
}

/** Weekly per-portfolio snapshot: what changed, performance, next week. */
export async function generateClientWeekly(
  scope: "household" | "client",
  scopeId: string,
  force: boolean,
): Promise<Draft> {
  const user = await requireUser();
  const id = uuid.parse(scopeId);
  const scopeKey = `${scope}:${id}`;
  if (!force) {
    const cached = await readCache("client_weekly", scopeKey);
    if (cached) return { text: cached, cached: true };
  }

  const supabase = await createClient();
  const weekAgoStr = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const in7Str = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: snaps } = await supabase
    .from("snapshots")
    .select("id, as_of")
    .order("as_of", { ascending: false });
  const nowSnap = snaps?.[0];
  if (!nowSnap) return { error: "no portfolio snapshot yet" };
  const prevSnap = (snaps ?? []).find((s) => s.as_of <= weekAgoStr) ?? nowSnap;

  const [holdNow, holdPrev, txWeek, ytd, flags, nameRow] = await Promise.all([
    holdingsForScope(scope, id, nowSnap.id),
    prevSnap.id === nowSnap.id
      ? Promise.resolve([])
      : holdingsForScope(scope, id, prevSnap.id),
    transactionsForScope(scope, id, { sinceDate: weekAgoStr, limit: 60 }),
    performanceSeries(scope, id, "ytd"),
    flagsForScope(scope, id),
    scope === "household"
      ? supabase.from("households").select("name").eq("id", id).single()
      : supabase.from("clients").select("name").eq("id", id).single(),
  ]);
  if (holdNow.length === 0) return { error: "no holdings for this scope in the latest snapshot" };

  const totalNow = holdNow.reduce((s, h) => s + h.market_value, 0);
  const totalPrev = holdPrev.reduce((s, h) => s + h.market_value, 0);
  const prevBySymbol = new Map<string, number>();
  for (const h of holdPrev) {
    const k = h.symbol ?? h.description ?? "Outros";
    prevBySymbol.set(k, (prevBySymbol.get(k) ?? 0) + h.market_value);
  }
  const nowBySymbol = new Map<string, number>();
  const byClass = new Map<string, number>();
  for (const h of holdNow) {
    const k = h.symbol ?? h.description ?? "Outros";
    nowBySymbol.set(k, (nowBySymbol.get(k) ?? 0) + h.market_value);
    const cls = h.asset_class ?? "Outros";
    byClass.set(cls, (byClass.get(cls) ?? 0) + h.market_value);
  }
  const movers = [...nowBySymbol.entries()]
    .map(([k, v]) => ({ k, delta: v - (prevBySymbol.get(k) ?? 0) }))
    .filter((m) => Math.abs(m.delta) >= 100)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);
  const allocation = [...byClass.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${PT_PERCENT.format(v / totalNow)}`)
    .join(", ");

  const flows = txWeek.filter((t) => ["contribution", "withdrawal", "dividend"].includes(t.activity));
  const flowLines = flows
    .slice(0, 10)
    .map(
      (t) =>
        `- ${t.activity} ${PT_CURRENCY.format(t.amount)} em ${PT_DATE.format(new Date(t.trade_date))}${t.symbol ? ` (${t.symbol})` : ""}`,
    )
    .join("\n");

  const agendaLines = [
    ...holdNow
      .filter((h) => h.next_ex_date && h.next_ex_date >= todayStr && h.next_ex_date <= in7Str)
      .map((h) => `- Ex-data ${PT_DATE.format(new Date(h.next_ex_date!))}: ${h.symbol ?? h.description}`),
    ...holdNow
      .filter((h) => h.maturity_date && h.maturity_date >= todayStr && h.maturity_date <= in7Str)
      .map((h) => `- Vencimento ${PT_DATE.format(new Date(h.maturity_date!))}: ${h.symbol ?? h.description} (${PT_CURRENCY.format(h.market_value)})`),
  ].join("\n");
  const lastYtd = ytd.length ? ytd[ytd.length - 1] : null;
  const openFlags = flags
    .filter((f) => !f.acknowledged_at)
    .map((f) => `- ${f.severity}: ${f.message}`)
    .join("\n");

  const facts =
    `Nome: ${nameRow.data?.name ?? "Carteira"}\n` +
    `Janela: ${PT_DATE.format(new Date(prevSnap.as_of))} a ${PT_DATE.format(new Date(nowSnap.as_of))}\n` +
    `Patrimonio: ${PT_CURRENCY.format(totalNow)}` +
    (totalPrev > 0 && prevSnap.id !== nowSnap.id
      ? ` (variacao na janela: ${PT_CURRENCY.format(totalNow - totalPrev)}, ${PT_PERCENT.format((totalNow - totalPrev) / totalPrev)})`
      : "") +
    "\n" +
    (lastYtd
      ? `TWR no ano: ${PT_PERCENT.format(lastYtd.twr)}${lastYtd.benchmark_twr !== null ? ` | Benchmark: ${PT_PERCENT.format(lastYtd.benchmark_twr)}` : ""}\n`
      : "") +
    `Alocacao atual: ${allocation}\n` +
    (movers.length
      ? `\nMaiores movimentos na semana:\n${movers.map((m) => `- ${m.k}: ${PT_CURRENCY.format(m.delta)}`).join("\n")}\n`
      : "") +
    (flowLines ? `\nFluxos da semana:\n${flowLines}\n` : "") +
    (agendaLines ? `\nAgenda dos proximos 7 dias:\n${agendaLines}\n` : "") +
    (openFlags ? `\nPontos de atencao em aberto:\n${openFlags}\n` : "");

  const result = await aiSearchComplete({
    system:
      "Voce prepara o retrato semanal interno de uma carteira para um assessor da L&S Investment Advisors. " +
      "Escreva em portugues brasileiro, direto e objetivo. " +
      HARD_RULES +
      " Estrutura da resposta: Resumo da semana: (variacao da carteira e contexto). " +
      "O que mudou: (movimentos, aportes, resgates e proventos). " +
      "Desempenho: (TWR e benchmark, apenas se fornecidos). " +
      "Semana que vem: (agenda fornecida). " +
      "Contexto de mercado: (fatos da semana ligados a carteira, com fontes). " +
      "Uma pergunta para levar ao cliente: (uma unica pergunta). Fontes: (URLs).",
    user:
      `Dados da carteira:\n${facts}\n` +
      `Pesquise na web o resumo de mercado da ultima semana relevante para estas classes: ${allocation}. Depois redija o retrato semanal.`,
    maxTokens: 2500,
  });
  return cacheAndAudit("client_weekly", scopeKey, user.id, result);
}
