import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "@/lib/supabase";

export type Role = "admin" | "editor" | "viewer";

interface AuthResult {
  userId: string;
  isAdmin: boolean;
}

/**
 * Get the current user's auth info. Throws if not authenticated.
 */
export async function requireAuth(): Promise<AuthResult> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const adminIds = (process.env.ADMIN_CLERK_IDS || "").split(",").map((s) => s.trim());
  const isAdmin = adminIds.includes(userId);

  return { userId, isAdmin };
}

/**
 * Check if the current user can access a specific business.
 * Admins can access all businesses.
 * Other users must have a row in user_business_access.
 *
 * Returns the user's role for that business, or null if no access.
 */
export async function checkBusinessAccess(
  businessId: string,
  requiredRole?: Role
): Promise<{ userId: string; role: Role } | null> {
  const { userId, isAdmin } = await requireAuth();

  if (isAdmin) {
    return { userId, role: "admin" };
  }

  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  const { data } = await supabase
    .from("user_business_access")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("business_id", businessId)
    .single();

  if (!data) return null;

  const role = data.role as Role;

  // Check role hierarchy if a minimum role is required
  if (requiredRole) {
    const hierarchy: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
    if (hierarchy[role] < hierarchy[requiredRole]) {
      return null;
    }
  }

  return { userId, role };
}

/**
 * Get all business IDs the current user can access.
 * Admins get all businesses. Others get their assigned ones.
 */
export async function getAccessibleBusinessIds(): Promise<string[]> {
  const { userId, isAdmin } = await requireAuth();

  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  if (isAdmin) {
    const { data } = await supabase.from("businesses").select("id");
    return (data || []).map((b) => b.id);
  }

  const { data } = await supabase
    .from("user_business_access")
    .select("business_id")
    .eq("clerk_user_id", userId);

  return (data || []).map((row) => row.business_id);
}
