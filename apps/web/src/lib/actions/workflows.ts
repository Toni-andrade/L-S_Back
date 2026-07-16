"use server";

import { stepDueAt } from "@ls/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole, requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

/** Start a playbook: snapshots the template's steps into a new run. */
export async function startWorkflow(formData: FormData): Promise<void> {
  const user = await requireUser();
  const templateId = uuid.parse(formData.get("templateId"));
  const clientId = (formData.get("clientId") as string | null) || null;
  const assignedRaw = (formData.get("assignedTo") as string | null) || "";
  const assignedTo = assignedRaw === "" ? user.id : uuid.parse(assignedRaw);

  const supabase = await createClient();
  const { data: template } = await supabase
    .from("workflow_templates")
    .select("id, name, kind")
    .eq("id", templateId)
    .single();
  if (!template) throw new Error("template not found");

  const { data: steps } = await supabase
    .from("workflow_template_steps")
    .select("seq, title, role, required, due_days, fields")
    .eq("template_id", templateId)
    .order("seq");

  let title = template.name;
  if (clientId) {
    const { data: c } = await supabase.from("clients").select("name").eq("id", clientId).single();
    if (c) title = `${template.name} · ${c.name}`;
  }

  const { data: run, error } = await supabase
    .from("workflow_runs")
    .insert({
      template_id: templateId,
      kind: template.kind,
      title,
      client_id: clientId ? uuid.parse(clientId) : null,
      status: "open",
      started_by: user.id,
      assigned_to: assignedTo,
    })
    .select("id")
    .single();
  if (error || !run) throw new Error(`workflow start failed: ${error?.message}`);

  const now = new Date();
  if (steps && steps.length > 0) {
    const { error: stepErr } = await supabase.from("workflow_run_steps").insert(
      steps.map((s) => ({
        run_id: run.id,
        seq: s.seq,
        title: s.title,
        role: s.role,
        required: s.required,
        status: "todo",
        due_at: stepDueAt(now, s.due_days)?.toISOString() ?? null,
        fields: s.fields ?? null,
      })),
    );
    if (stepErr) throw new Error(`workflow steps failed: ${stepErr.message}`);
  }

  await writeAudit({
    action: "workflow.start",
    entityType: "workflow_runs",
    entityId: run.id,
    after: { template: template.kind, client_id: clientId, assigned_to: assignedTo },
  });
  if (assignedTo !== user.id) {
    await notify({
      userId: assignedTo,
      kind: "workflow_assigned",
      title: `Playbook assigned to you: ${title}`,
      href: `/workflows/${run.id}`,
    });
  }
  revalidatePath("/workflows");
  revalidatePath("/onboarding");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  redirect(`/workflows/${run.id}`);
}

const stepStatus = z.enum(["todo", "done", "skipped", "blocked"]);

/** Advance a step; when every required step is done the run auto-completes. */
export async function setStepStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const stepId = uuid.parse(formData.get("stepId"));
  const runId = uuid.parse(formData.get("runId"));
  const to = stepStatus.parse(formData.get("to"));

  const supabase = await createClient();
  const done = to === "done";

  // Structured capture: field_<key> inputs merge into the step's data jsonb.
  const captured: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("field_") && typeof v === "string" && v.trim() !== "") {
      captured[k.slice("field_".length)] = v.trim();
    }
  }

  const update: Record<string, unknown> = {
    status: to,
    completed_by: done ? user.id : null,
    completed_at: done ? new Date().toISOString() : null,
  };
  if (Object.keys(captured).length > 0) {
    const { data: existing } = await supabase
      .from("workflow_run_steps")
      .select("data")
      .eq("id", stepId)
      .single();
    update.data = { ...((existing?.data as Record<string, unknown>) ?? {}), ...captured };
  }

  const { error } = await supabase.from("workflow_run_steps").update(update).eq("id", stepId);
  if (error) throw new Error(error.message);

  // Recompute run status from its steps.
  const { data: steps } = await supabase
    .from("workflow_run_steps")
    .select("status, required")
    .eq("run_id", runId);
  const requiredOpen = (steps ?? []).filter(
    (s) => s.required && s.status !== "done" && s.status !== "skipped",
  ).length;
  const anyStarted = (steps ?? []).some((s) => s.status === "done" || s.status === "skipped");
  const anyBlocked = (steps ?? []).some((s) => s.status === "blocked");
  const runStatus = requiredOpen === 0 ? "done" : anyBlocked ? "blocked" : anyStarted ? "in_progress" : "open";

  await supabase
    .from("workflow_runs")
    .update({
      status: runStatus,
      completed_at: runStatus === "done" ? new Date().toISOString() : null,
    })
    .eq("id", runId);

  await writeAudit({
    action: "workflow.step",
    entityType: "workflow_run_steps",
    entityId: stepId,
    after: {
      status: to,
      run_status: runStatus,
      ...(Object.keys(captured).length > 0 ? { data: captured } : {}),
    },
  });
  revalidatePath(`/workflows/${runId}`);
  revalidatePath("/workflows");
  revalidatePath("/onboarding");
}

export async function cancelWorkflow(formData: FormData): Promise<void> {
  await requireUser();
  const runId = uuid.parse(formData.get("runId"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflow_runs")
    .update({ status: "canceled" })
    .eq("id", runId);
  if (error) throw new Error(error.message);
  await writeAudit({ action: "workflow.cancel", entityType: "workflow_runs", entityId: runId });
  revalidatePath("/workflows");
  revalidatePath(`/workflows/${runId}`);
  revalidatePath("/onboarding");
}

const custodianSchema = z.enum(["ibkr", "morgan_stanley", "other"]);

/**
 * Create the custody account from inside an account-opening run and link it
 * to the run. Uses the service client because account writes are an ops/admin
 * operation while the accounts RLS write policy targets advisors/admin; the
 * requireRole guard plus audit rows cover the bypass (same pattern as
 * convertIntake).
 */
export async function createAccountForRun(formData: FormData): Promise<void> {
  await requireRole("ops", "admin");
  const runId = uuid.parse(formData.get("runId"));
  const clientId = uuid.parse(formData.get("clientId"));
  const custodian = custodianSchema.parse(formData.get("custodian"));
  const masked = z.string().trim().min(2).max(32).parse(formData.get("accountNumberMasked"));
  const currency = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .parse(formData.get("baseCurrency") || "USD");
  const addeparRaw = (formData.get("addeparEntityId") as string | null)?.trim() || null;

  const service = createServiceClient();
  const { data: run } = await service
    .from("workflow_runs")
    .select("id, client_id, account_id")
    .eq("id", runId)
    .single();
  if (!run) throw new Error("workflow run not found");
  if (run.client_id !== clientId) throw new Error("client mismatch");
  if (run.account_id) throw new Error("this run is already linked to an account");

  const { data: account, error } = await service
    .from("accounts")
    .insert({
      client_id: clientId,
      custodian,
      account_number_masked: masked,
      base_currency: currency,
      addepar_entity_id: addeparRaw,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !account) {
    if (error?.code === "23505")
      throw new Error(`Addepar entity ${addeparRaw} is already mapped to another account`);
    throw new Error(`account insert failed: ${error?.message}`);
  }

  const { error: linkErr } = await service
    .from("workflow_runs")
    .update({ account_id: account.id })
    .eq("id", runId);
  if (linkErr) throw new Error(linkErr.message);

  await writeAudit({
    action: "account.create",
    entityType: "accounts",
    entityId: account.id,
    after: {
      client_id: clientId,
      custodian,
      account_number_masked: masked,
      addepar_entity_id: addeparRaw,
      source: "workflow_run",
      run_id: runId,
    },
  });
  revalidatePath(`/workflows/${runId}`);
  revalidatePath("/accounts");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/onboarding");
}
