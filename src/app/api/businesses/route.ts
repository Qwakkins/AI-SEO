import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("*, visibility_scores(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { name, location, category, website_url } = body;

  if (!name || !location || !category) {
    return Response.json(
      { error: "name, location, and category are required" },
      { status: 400 }
    );
  }

  // Insert the business
  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .insert({ name, location, category, website_url })
    .select()
    .single();

  if (bizError) {
    return Response.json({ error: bizError.message }, { status: 500 });
  }

  // Auto-generate default tracking queries
  const templates = [
    `best ${category} in ${location}`,
    `top ${category} near ${location}`,
    `recommended ${category} in ${location}`,
    `${category} ${location} reviews`,
  ];

  const queries = templates.map((query_template) => ({
    business_id: business.id,
    query_template,
  }));

  const { error: queryError } = await supabase
    .from("tracking_queries")
    .insert(queries);

  if (queryError) {
    return Response.json({ error: queryError.message }, { status: 500 });
  }

  return Response.json(business, { status: 201 });
}
