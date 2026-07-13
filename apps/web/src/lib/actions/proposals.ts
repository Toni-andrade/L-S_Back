"use server";

import { evaluateProposalFlags, type RiskProfileBand } from "@ls/domain";
import {
  generateEmailDraft,
  proposalBriefSchema,
  renderProposalPptx,
  validateBrief,
  type ProposalBrief,
  type StrategyInfo,
} from "@ls/docgen";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

/** strategies rows loaded from the DB, in the docgen shape. */
async function loadLibrary(): Promise<StrategyInfo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("strategies")
    .select("key, name, description, kind, risk_label, active, metrics, instruments");
  return (data ?? []).map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description,
    kind: s.kind,
    riskLabel: s.risk_label,
    active: s.active,
    metrics: s.metrics,
    symbols: Array.isArray(s.instruments?.holdings)
      ? s.instruments.holdings
          .map((h: { symbol?: string }) => h.symbol)
          .filter((sym: unknown): sym is string => typeof sym === "string")
      : [],
  }));
}

function briefFromForm(formData: FormData): ProposalBrief {
  const keys = formData.getAll("strategyKey").map(String);
  const weights = formData.getAll("strategyWeight").map(String);
  const sources = formData.getAll("strategyReturnSource").map(String);
  const asOfs = formData.getAll("strategyAsOf").map(String);

  const strategies = keys
    .map((key, i) => ({
      key: key.trim(),
      weight: Number(weights[i] ?? 0),
      riskLabel: null,
      returnSource: (sources[i] === "manual" ? "manual" : "library") as "library" | "manual",
      asOfDate: asOfs[i]?.trim() ? asOfs[i]!.trim() : null,
    }))
    .filter((row) => row.key !== "" && row.weight > 0);

  return proposalBriefSchema.parse({
    clientName: formData.get("clientName"),
    salutation: formData.get("salutation"),
    totalAum: Number(formData.get("totalAum")),
    currency: "USD",
    riskProfile: formData.get("riskProfile"),
    monthYear: formData.get("monthYear"),
    strategies,
    notes: (formData.get("notes") as string | null)?.trim() || null,
  });
}

async function recomputeProposalFlags(proposalId: string): Promise<void> {
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("proposals")
    .select("id, client_id, model_id, risk_profile, brief")
    .eq("id", proposalId)
    .single();
  if (!p) return;

  const [library, { data: client }, { data: model }, { data: issuers }] = await Promise.all([
    loadLibrary(),
    p.client_id
      ? supabase
          .from("clients")
          .select("id, name, is_brazil_taxpayer, is_us_nra, domicile_country, risk_profile")
          .eq("id", p.client_id)
          .single()
      : Promise.resolve({ data: null }),
    p.model_id
      ? supabase.from("models").select("risk_profile").eq("id", p.model_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("blocked_issuers").select("name, ticker, active"),
  ]);

  const byKey = new Map(library.map((s) => [s.key, s]));
  const brief = p.brief as ProposalBrief;
  const flags = evaluateProposalFlags({
    client: client
      ? {
          id: client.id,
          name: client.name,
          isBrazilTaxpayer: client.is_brazil_taxpayer,
          isUsNra: client.is_us_nra,
          domicileCountry: client.domicile_country,
          riskProfile: client.risk_profile,
        }
      : null,
    riskProfile: p.risk_profile as RiskProfileBand,
    modelRiskProfile: (model?.risk_profile as RiskProfileBand | undefined) ?? null,
    strategies: brief.strategies.map((row) => {
      const info = byKey.get(row.key);
      return {
        key: row.key,
        name: info?.name ?? row.key,
        weight: row.weight,
        symbols: info?.symbols ?? [],
        returnSource: row.returnSource,
        asOfDate: row.asOfDate,
      };
    }),
    blockedIssuers: (issuers ?? []).map((b) => ({
      name: b.name,
      ticker: b.ticker,
      active: b.active,
    })),
    today: new Date(),
  });

  await supabase
    .from("proposal_flags")
    .delete()
    .eq("proposal_id", proposalId)
    .is("acknowledged_at", null);
  if (flags.length > 0) {
    await supabase.from("proposal_flags").insert(
      flags.map((f) => ({
        proposal_id: proposalId,
        code: f.code,
        severity: f.severity,
        message: f.message,
      })),
    );
  }
}

/** Create a draft, update an existing draft, or start version+1 of a locked one. */
export async function saveProposal(formData: FormData): Promise<void> {
  const user = await requireRole("advisor", "admin");
  const brief = briefFromForm(formData);
  const library = await loadLibrary();
  const errors = validateBrief(brief, library);
  if (errors.length > 0) throw new Error(`brief invalid: ${errors.join("; ")}`);

  const proposalId = (formData.get("proposalId") as string | null) || null;
  const supersedesId = (formData.get("supersedesId") as string | null) || null;
  const clientId = (formData.get("clientId") as string | null) || null;
  const modelId = (formData.get("modelId") as string | null) || null;

  const byKey = new Map(library.map((s) => [s.key, s]));
  const allocation = brief.strategies.map((row) => ({
    key: row.key,
    name: byKey.get(row.key)?.name ?? row.key,
    weight: row.weight,
    risk_label: row.riskLabel ?? byKey.get(row.key)?.riskLabel ?? null,
    return_source: row.returnSource,
  }));

  const record = {
    client_id: clientId ? uuid.parse(clientId) : null,
    client_name: brief.clientName,
    salutation: brief.salutation,
    brief,
    model_id: modelId ? uuid.parse(modelId) : null,
    allocation,
    total_aum: brief.totalAum,
    currency: brief.currency,
    risk_profile: brief.riskProfile,
    month_year: brief.monthYear,
  };

  const supabase = await createClient();
  let id: string;

  if (proposalId) {
    const pid = uuid.parse(proposalId);
    const { data: existing } = await supabase
      .from("proposals")
      .select("id, status, locked")
      .eq("id", pid)
      .single();
    if (!existing) throw new Error("proposal not found");
    if (existing.locked || !["draft", "in_review"].includes(existing.status)) {
      throw new Error("only draft or in-review proposals can be edited; revise to create a new version");
    }
    const { error } = await supabase
      .from("proposals")
      .update({ ...record, status: "draft" })
      .eq("id", pid);
    if (error) throw new Error(error.message);
    id = pid;
    await writeAudit({
      action: "proposal.update",
      entityType: "proposals",
      entityId: id,
      after: { total_aum: brief.totalAum, strategies: allocation.length },
    });
  } else {
    let version = 1;
    if (supersedesId) {
      const { data: prior } = await supabase
        .from("proposals")
        .select("version")
        .eq("id", uuid.parse(supersedesId))
        .single();
      version = (prior?.version ?? 0) + 1;
    }
    const { data, error } = await supabase
      .from("proposals")
      .insert({
        ...record,
        status: "draft",
        version,
        supersedes_id: supersedesId ? uuid.parse(supersedesId) : null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`proposal insert failed: ${error?.message}`);
    id = data.id;
    await writeAudit({
      action: "proposal.create",
      entityType: "proposals",
      entityId: id,
      after: { version, supersedes_id: supersedesId, client_name: brief.clientName },
    });
  }

  await recomputeProposalFlags(id);
  revalidatePath("/proposals");
  redirect(`/proposals/${id}`);
}

/** Render the PPTX + email draft and store them (Supabase Storage). */
export async function generateProposalArtifacts(formData: FormData): Promise<void> {
  await requireRole("advisor", "admin");
  const id = uuid.parse(formData.get("id"));

  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!p) throw new Error("proposal not found");

  const library = await loadLibrary();
  const brief = proposalBriefSchema.parse(p.brief);
  const { buffer } = await renderProposalPptx(brief, library);
  const emailDraft = generateEmailDraft(brief, library);

  const path = `${id}/proposta-v${p.version}.pptx`;
  const service = createServiceClient();
  const { error: uploadError } = await service.storage.from("proposals").upload(path, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    upsert: !p.locked,
  });
  if (uploadError && !(p.locked && uploadError.message.includes("already exists"))) {
    throw new Error(`pptx upload failed: ${uploadError.message}`);
  }

  const { error } = await supabase
    .from("proposals")
    .update({ pptx_path: path, email_draft: emailDraft })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "proposal.generate",
    entityType: "proposals",
    entityId: id,
    after: { pptx_path: path },
  });
  await recomputeProposalFlags(id);
  revalidatePath(`/proposals/${id}`);
}

export async function submitProposalForReview(formData: FormData): Promise<void> {
  await requireRole("advisor", "admin");
  const id = uuid.parse(formData.get("id"));
  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("status").eq("id", id).single();
  if (p?.status !== "draft") throw new Error("only drafts can be submitted for review");
  const { error } = await supabase.from("proposals").update({ status: "in_review" }).eq("id", id);
  if (error) throw new Error(error.message);
  await writeAudit({
    action: "proposal.submit",
    entityType: "proposals",
    entityId: id,
    before: { status: "draft" },
    after: { status: "in_review" },
  });
  revalidatePath(`/proposals/${id}`);
}

/** Approval requires zero unacknowledged blocker flags; locks the version. */
export async function approveProposal(formData: FormData): Promise<void> {
  const user = await requireRole("advisor", "admin");
  const id = uuid.parse(formData.get("id"));

  const supabase = await createClient();
  const [{ data: p }, { data: blockers }] = await Promise.all([
    supabase.from("proposals").select("status, supersedes_id").eq("id", id).single(),
    supabase
      .from("proposal_flags")
      .select("id")
      .eq("proposal_id", id)
      .eq("severity", "blocker")
      .is("acknowledged_at", null),
  ]);
  if (!p || p.status !== "in_review") throw new Error("only in-review proposals can be approved");
  if ((blockers ?? []).length > 0) {
    throw new Error("unacknowledged blocker flags gate approval; acknowledge each with a reason first");
  }

  const { error } = await supabase
    .from("proposals")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      locked: true,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Approving version N marks the prior version superseded (Section 8.5).
  if (p.supersedes_id) {
    await supabase.from("proposals").update({ status: "superseded" }).eq("id", p.supersedes_id);
  }

  await writeAudit({
    action: "proposal.approve",
    entityType: "proposals",
    entityId: id,
    after: { locked: true, superseded_prior: p.supersedes_id },
  });
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
}

export async function markProposalSent(formData: FormData): Promise<void> {
  await requireRole("advisor", "admin");
  const id = uuid.parse(formData.get("id"));
  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("status").eq("id", id).single();
  if (p?.status !== "approved") throw new Error("only approved proposals can be marked sent");
  const { error } = await supabase.from("proposals").update({ status: "sent" }).eq("id", id);
  if (error) throw new Error(error.message);
  await writeAudit({
    action: "proposal.sent",
    entityType: "proposals",
    entityId: id,
    before: { status: "approved" },
    after: { status: "sent" },
  });
  revalidatePath(`/proposals/${id}`);
}

/** Acknowledge a proposal flag; a reason is mandatory (DB check too). */
export async function acknowledgeProposalFlag(formData: FormData): Promise<void> {
  const user = await requireUser();
  const flagId = uuid.parse(formData.get("flagId"));
  const reason = z.string().trim().min(3).parse(formData.get("reason"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("proposal_flags")
    .select("id, proposal_id, code, severity")
    .eq("id", flagId)
    .single();
  if (!before) throw new Error("flag not found");

  const { error } = await supabase
    .from("proposal_flags")
    .update({
      acknowledged_by: user.id,
      acknowledged_at: new Date().toISOString(),
      ack_reason: reason,
    })
    .eq("id", flagId);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "proposal_flag.acknowledge",
    entityType: "proposal_flags",
    entityId: flagId,
    before,
    after: { ack_reason: reason },
  });
  revalidatePath(`/proposals/${before.proposal_id}`);
}
