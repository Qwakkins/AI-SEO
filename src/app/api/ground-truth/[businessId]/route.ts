import { getSupabase } from "@/lib/supabase";
import { checkBusinessAccess } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  const access = await checkBusinessAccess(businessId);
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data } = await supabase
    .from("business_ground_truth")
    .select("*")
    .eq("business_id", businessId)
    .single();

  return Response.json(data || {});
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  const access = await checkBusinessAccess(businessId, "editor");
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const body = await request.json();

  const { data, error } = await supabase
    .from("business_ground_truth")
    .upsert(
      {
        business_id: businessId,
        phone: body.phone || null,
        address_street: body.address_street || null,
        address_city: body.address_city || null,
        address_state: body.address_state || null,
        address_zip: body.address_zip || null,
        website_url: body.website_url || null,
        services: body.services || [],
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id" }
    )
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
