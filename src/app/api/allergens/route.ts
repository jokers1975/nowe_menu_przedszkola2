import { db } from "@/db";
import { allergens } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .select({
        id: allergens.id,
        number: allergens.number,
        name: allergens.name,
        description: allergens.description,
      })
      .from(allergens)
      .orderBy(asc(allergens.number));
    return Response.json({ allergens: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Cannot load allergens", details: message }, { status: 500 });
  }
}
