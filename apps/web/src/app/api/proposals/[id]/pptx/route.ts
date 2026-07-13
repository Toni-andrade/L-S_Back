import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Signed, short-lived download of a proposal PPTX (bucket is private). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: proposal } = await supabase
    .from("proposals")
    .select("pptx_path")
    .eq("id", id)
    .single();
  if (!proposal?.pptx_path) {
    return NextResponse.json({ error: "no PPTX generated for this proposal" }, { status: 404 });
  }

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from("proposals")
    .createSignedUrl(proposal.pptx_path, 60);
  if (error || !data) {
    return NextResponse.json({ error: "could not sign download URL" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
