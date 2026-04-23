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
    const seen = new Set<number>();
    const deduped = rows.filter((r) => (seen.has(r.number) ? false : (seen.add(r.number), true)));
    return Response.json({ allergens: deduped });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Cannot load allergens", details: message }, { status: 500 });
  }
}
