import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userRoles } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdmin, checkSuperAdmin, forbiddenResponse, getCurrentUser, unauthorizedResponse } from "@/lib/auth";

type UserRow = {
  id: string;
  email: string | null;
  createdAt: string;
  role: "super_admin" | "admin" | null;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  const admin = await checkAdmin();
  if (!admin) return forbiddenResponse();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const roleRows = await db.select().from(userRoles);
    const roleMap = new Map<string, "super_admin" | "admin">();
    for (const r of roleRows) {
      const current = roleMap.get(r.userId);
      if (r.role === "super_admin" || !current) {
        roleMap.set(r.userId, r.role as "super_admin" | "admin");
      }
    }

    const users: UserRow[] = data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      createdAt: u.created_at,
      role: roleMap.get(u.id) ?? null,
    }));
    users.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    return Response.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  const acting = await checkSuperAdmin();
  if (!acting) return forbiddenResponse();

  try {
    const body = (await req.json()) as { userId?: string; grant?: boolean };
    if (!body.userId || typeof body.grant !== "boolean") {
      return Response.json({ error: "userId i grant są wymagane." }, { status: 400 });
    }

    if (body.userId === acting.user.id && !body.grant) {
      return Response.json({ error: "Nie możesz odebrać uprawnień sobie." }, { status: 400 });
    }

    if (body.grant) {
      const existing = await db
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, body.userId), eq(userRoles.role, "admin")));
      if (existing.length === 0) {
        await db.insert(userRoles).values({ userId: body.userId, role: "admin" });
      }
    } else {
      // Nie usuwamy super_admin — tylko zwykłą rolę admin
      await db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, body.userId), eq(userRoles.role, "admin")));
    }

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
