"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { userRoles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

async function promoteFirstUserIfEmpty(userId: string) {
  // Idempotent: first-ever user becomes super_admin.
  // Wrap in transaction to avoid a race where two users register at once.
  await db.transaction(async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(userRoles);
    if (count === 0) {
      await tx.insert(userRoles).values({ userId, role: "super_admin" });
    }
  });
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const url = new URL(`http://placeholder/login`);
    url.searchParams.set("error", error.message);
    if (next) url.searchParams.set("next", next);
    redirect(`/login?${url.searchParams.toString()}`);
  }

  // If we got here via confirmed-email flow (or confirmation disabled), ensure
  // the first-ever user gets super_admin.
  if (data.user) {
    try {
      await promoteFirstUserIfEmpty(data.user.id);
    } catch (e) {
      console.error("promoteFirstUserIfEmpty failed", e);
    }
  }

  revalidatePath("/", "layout");
  redirect(next || "/");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const url = new URL(`http://placeholder/login`);
    url.searchParams.set("error", error.message);
    url.searchParams.set("mode", "signup");
    redirect(`/login?${url.searchParams.toString()}`);
  }

  if (data.user) {
    try {
      await promoteFirstUserIfEmpty(data.user.id);
    } catch (e) {
      console.error("promoteFirstUserIfEmpty failed", e);
    }
  }

  // Jeśli Supabase zwrócił sesję (email-confirm wyłączony lokalnie) — wejdź od razu.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  redirect("/login?info=check-email");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
