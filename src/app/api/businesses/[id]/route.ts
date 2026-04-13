import { getSupabase } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", id)
    .single();

  if (bizError) {
    return Response.json({ error: bizError.message }, { status: 404 });
  }

  const { data: queries } = await supabase
    .from("tracking_queries")
    .select("*")
    .eq("business_id", id)
    .order("created_at", { ascending: true });

  const { data: scores } = await supabase
    .from("visibility_scores")
    .select("*")
    .eq("business_id", id)
    .order("period_start", { ascending: false });

  return Response.json({ ...business, tracking_queries: queries, visibility_scores: scores });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { error } = await supabase
    .from("businesses")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
