import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Signed, short-lived download of a client document (RLS-checked). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Request-scoped client: RLS returns the row only if the user can see the client.
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, name")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data, error } = await createServiceClient()
    .storage.from("client-documents")
    .createSignedUrl(doc.storage_path, 60, { download: doc.name });
  if (error || !data) {
    return NextResponse.json({ error: "could not sign URL" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
