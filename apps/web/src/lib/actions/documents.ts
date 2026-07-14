"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const category = z.enum(["kyc", "agreement", "statement", "tax", "correspondence", "proposal", "other"]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** Upload a client document to the private bucket and index it (RLS-scoped). */
export async function uploadDocument(formData: FormData): Promise<void> {
  const user = await requireUser();
  const clientId = uuid.parse(formData.get("clientId"));
  const cat = category.parse(formData.get("category"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("no file provided");
  if (file.size > MAX_BYTES) throw new Error("file exceeds 25 MB limit");

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const key = `${clientId}/${crypto.randomUUID()}-${safeName}`;

  const service = createServiceClient();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await service.storage.from("client-documents").upload(key, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);

  // Index row via the request client so RLS enforces client visibility.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      client_id: clientId,
      category: cat,
      name: safeName,
      storage_path: key,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    // Roll back the orphaned object if the index insert was rejected.
    await service.storage.from("client-documents").remove([key]);
    throw new Error(error.message);
  }

  await writeAudit({
    action: "document.upload",
    entityType: "documents",
    entityId: data.id,
    after: { client_id: clientId, category: cat, name: safeName, size: file.size },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteDocument(formData: FormData): Promise<void> {
  await requireUser();
  const id = uuid.parse(formData.get("id"));
  const clientId = uuid.parse(formData.get("clientId"));

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!doc) throw new Error("document not found");

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await createServiceClient().storage.from("client-documents").remove([doc.storage_path]);

  await writeAudit({ action: "document.delete", entityType: "documents", entityId: id });
  revalidatePath(`/clients/${clientId}`);
}
