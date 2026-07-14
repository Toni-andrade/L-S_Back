"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

/** Start a playbook: snapshots the template's steps into a new run. */
export async function startWorkflow(formData: FormData): Promise<void> {
  const user = await requireUser();
  const templateId = uuid.parse(formData.get("templateId"));
  const clientId = (formData.get("clientId") as string | null) || null;

  const supabase = await createClient();
  const { data: template } = await supabase
    .from("workflow_templates")
    .select("id, name, kind")
    .eq("id", templateId)
    .single();
  if (!template) throw new Error("template not found");

  const { data: steps } = await supabase
    .from("workflow_template_steps")
    .select("seq, title, role, required")
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
      assigned_to: user.id,
    })
    .select("id")
    .single();
  if (error || !run) throw new Error(`workflow start failed: ${error?.message}`);

  if (steps && steps.length > 0) {
    const { error: stepErr } = await supabase.from("workflow_run_steps").insert(
      steps.map((s) => ({
        run_id: run.id,
        seq: s.seq,
        title: s.title,
        role: s.role,
        required: s.required,
        status: "todo",
      })),
    );
    if (stepErr) throw new Error(`workflow steps failed: ${stepErr.message}`);
  }

  await writeAudit({
    action: "workflow.start",
    entityType: "workflow_runs",
    entityId: run.id,
    after: { template: template.kind, client_id: clientId },
  });
  revalidatePath("/workflows");
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
  const { error } = await supabase
    .from("workflow_run_steps")
    .update({
      status: to,
      completed_by: done ? user.id : null,
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", stepId);
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
    after: { status: to, run_status: runStatus },
  });
  revalidatePath(`/workflows/${runId}`);
  revalidatePath("/workflows");
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
}
