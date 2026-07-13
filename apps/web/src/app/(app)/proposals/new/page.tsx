import type { ProposalBrief } from "@ls/docgen";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveProposal } from "@/lib/actions/proposals";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const MAX_ROWS = 8;

type RowDefault = {
  key: string;
  weight: string;
  returnSource: "library" | "manual";
  asOfDate: string;
};

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; draft?: string; from?: string; clientId?: string }>;
}) {
  await requireRole("advisor", "admin");
  const params = await searchParams;

  const supabase = await createClient();
  const [{ data: strategies }, { data: clients }, { data: models }] = await Promise.all([
    supabase.from("strategies").select("id, key, name, active").order("key"),
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("models")
      .select("id, name, risk_profile, status, model_sleeves(strategy_id, target_weight)")
      .order("name"),
  ]);
  const strategyById = new Map((strategies ?? []).map((s) => [s.id, s]));

  // Prefill: existing draft (edit), locked proposal (revise -> v2), or a model.
  let rows: RowDefault[] = [];
  let defaults: Partial<ProposalBrief> = {};
  let proposalId: string | null = null;
  let supersedesId: string | null = null;
  let clientId = params.clientId ?? "";
  let modelId = params.model ?? "";
  let heading = "New Proposal";

  const sourceId = params.draft ?? params.from;
  if (sourceId) {
    const { data: p } = await supabase.from("proposals").select("*").eq("id", sourceId).single();
    if (p) {
      const brief = p.brief as ProposalBrief;
      defaults = brief;
      clientId = p.client_id ?? "";
      modelId = p.model_id ?? "";
      rows = brief.strategies.map((s) => ({
        key: s.key,
        weight: String(s.weight),
        returnSource: s.returnSource,
        asOfDate: s.asOfDate ?? "",
      }));
      if (params.draft && !p.locked && ["draft", "in_review"].includes(p.status)) {
        proposalId = p.id;
        heading = `Edit Draft v${p.version}`;
      } else {
        supersedesId = p.id;
        heading = `Revise: new version v${p.version + 1}`;
      }
    }
  } else if (params.model) {
    const model = (models ?? []).find((m) => m.id === params.model);
    if (model) {
      defaults = { riskProfile: model.risk_profile };
      rows = (model.model_sleeves ?? []).map(
        (s: { strategy_id: string; target_weight: number }) => ({
          key: strategyById.get(s.strategy_id)?.key ?? "",
          weight: String(Number(s.target_weight)),
          returnSource: "library" as const,
          asOfDate: "",
        }),
      );
    }
  }
  while (rows.length < MAX_ROWS) {
    rows.push({ key: "", weight: "", returnSource: "library", asOfDate: "" });
  }

  const inputClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";
  const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400";

  return (
    <div>
      <PageHeader
        title={heading}
        subtitle="Weights must sum to exactly 100%. Manual figures need an as-of date (INDICATIVE_DATA blocks otherwise)."
      />
      <Card className="max-w-4xl">
        <CardContent className="pt-5">
          <form action={saveProposal} className="flex flex-col gap-5">
            {proposalId ? <input type="hidden" name="proposalId" value={proposalId} /> : null}
            {supersedesId ? <input type="hidden" name="supersedesId" value={supersedesId} /> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Client name (as printed)</label>
                <input
                  name="clientName"
                  required
                  defaultValue={defaults.clientName ?? ""}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Salutation</label>
                <input
                  name="salutation"
                  required
                  placeholder="Maria"
                  defaultValue={defaults.salutation ?? ""}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Linked client (optional, enables tax flags)</label>
                <select name="clientId" defaultValue={clientId} className={inputClass}>
                  <option value="">Prospect (no client record)</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Start from model (optional)</label>
                <select name="modelId" defaultValue={modelId} className={inputClass}>
                  <option value="">None</option>
                  {(models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.risk_profile}, {m.status})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  Pick a model and reopen this form via /proposals/new?model=… to prefill sleeves.
                </p>
              </div>
              <div>
                <label className={labelClass}>Total AUM (USD)</label>
                <input
                  name="totalAum"
                  type="number"
                  min="1"
                  step="any"
                  required
                  defaultValue={defaults.totalAum ?? ""}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Risk profile</label>
                <select
                  name="riskProfile"
                  defaultValue={defaults.riskProfile ?? "moderado"}
                  className={inputClass}
                >
                  <option value="conservador">Conservador</option>
                  <option value="moderado">Moderado</option>
                  <option value="agressivo">Agressivo</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Month / Year (as printed)</label>
                <input
                  name="monthYear"
                  required
                  placeholder="Julho 2026"
                  defaultValue={defaults.monthYear ?? ""}
                  className={inputClass}
                />
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Strategies (blank rows are ignored)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_110px_140px_150px] gap-2 text-xs uppercase tracking-wide text-slate-400">
                  <span>Strategy</span>
                  <span>Weight %</span>
                  <span>Return source</span>
                  <span>As-of (manual)</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_110px_140px_150px] gap-2">
                    <select name="strategyKey" defaultValue={row.key} className={inputClass}>
                      <option value="">—</option>
                      {(strategies ?? [])
                        .filter((s) => s.active || s.key === row.key)
                        .map((s) => (
                          <option key={s.id} value={s.key}>
                            {s.key} · {s.name}
                          </option>
                        ))}
                    </select>
                    <input
                      name="strategyWeight"
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      defaultValue={row.weight}
                      className={inputClass}
                    />
                    <select
                      name="strategyReturnSource"
                      defaultValue={row.returnSource}
                      className={inputClass}
                    >
                      <option value="library">Library</option>
                      <option value="manual">Manual</option>
                    </select>
                    <input
                      name="strategyAsOf"
                      type="date"
                      defaultValue={row.asOfDate}
                      className={inputClass}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <div>
              <label className={labelClass}>Notes (internal)</label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={defaults.notes ?? ""}
                className={inputClass}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit">Save Draft</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
