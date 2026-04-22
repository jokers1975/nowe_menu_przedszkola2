import { getCurrentUser, getUserRole } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ userId: null, role: null }, { status: 200 });
  const role = await getUserRole(user.id);
  return Response.json({ userId: user.id, email: user.email ?? null, role });
}
