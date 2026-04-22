import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userRoles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type Role = "super_admin" | "admin";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function getCurrentUserId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new UnauthorizedError();
  }
  return data.user.id;
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getUserRole(userId: string): Promise<Role | null> {
  const rows = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  if (rows.length === 0) return null;
  if (rows.some((r) => r.role === "super_admin")) return "super_admin";
  if (rows.some((r) => r.role === "admin")) return "admin";
  return null;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getUserRole(user.id);
  if (role !== "admin" && role !== "super_admin") redirect("/");
  return { user, role };
}

export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getUserRole(user.id);
  if (role !== "super_admin") redirect("/");
  return { user, role };
}

// API-friendly variants that don't throw redirects — return null on failure so
// the caller can return a JSON response instead.
export async function checkAdmin(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; role: Role } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = await getUserRole(user.id);
  if (role !== "admin" && role !== "super_admin") return null;
  return { user, role };
}

export async function checkSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = await getUserRole(user.id);
  if (role !== "super_admin") return null;
  return { user, role };
}

export function unauthorizedResponse() {
  return Response.json({ error: "Nieautoryzowany dostęp." }, { status: 401 });
}

export function forbiddenResponse() {
  return Response.json({ error: "Brak uprawnień." }, { status: 403 });
}
