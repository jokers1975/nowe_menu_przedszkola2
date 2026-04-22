import "dotenv/config";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, client } from "../src/db/index";
import { allergens, globalDishes, globalDishAllergens } from "../src/db/schema";
import type { DietType, MealType } from "../src/lib/sanepid-brain";

type ExtraDish = {
  name: string;
  mealType: MealType;
  diet: DietType;
  hasVegFruit: boolean;
  allergenNumbers: number[];
};

const EXTRAS: ExtraDish[] = [
  // obiad_zupa (5)
  { name: "Rosół drobiowy z makaronem i natką pietruszki", mealType: "obiad_zupa", diet: "meat", hasVegFruit: true, allergenNumbers: [1, 3, 9] },
  { name: "Zupa pomidorowa z ryżem i śmietaną", mealType: "obiad_zupa", diet: "vegetarian", hasVegFruit: true, allergenNumbers: [7, 9] },
  { name: "Żurek staropolski z jajkiem i białą kiełbasą", mealType: "obiad_zupa", diet: "meat", hasVegFruit: false, allergenNumbers: [1, 3, 9] },
  { name: "Krupnik jęczmienny z warzywami korzeniowymi", mealType: "obiad_zupa", diet: "meat", hasVegFruit: true, allergenNumbers: [1, 9] },
  { name: "Zupa ogórkowa z ziemniakami i koperkiem", mealType: "obiad_zupa", diet: "vegetarian", hasVegFruit: true, allergenNumbers: [7, 9] },

  // drugie_sniadanie_deser (5)
  { name: "Jogurt naturalny z granolą i malinami", mealType: "drugie_sniadanie_deser", diet: "vegetarian", hasVegFruit: true, allergenNumbers: [1, 7, 8] },
  { name: "Ciasto drożdżowe z jabłkami i cynamonem", mealType: "drugie_sniadanie_deser", diet: "vegetarian", hasVegFruit: true, allergenNumbers: [1, 3, 7] },
  { name: "Pudding ryżowy z musem truskawkowym", mealType: "drugie_sniadanie_deser", diet: "vegetarian", hasVegFruit: true, allergenNumbers: [7] },
  { name: "Galaretka owocowa z kiwi i pomarańczą", mealType: "drugie_sniadanie_deser", diet: "vegetarian", hasVegFruit: true, allergenNumbers: [] },
  { name: "Kanapka z pastą jajeczną na chlebie graham", mealType: "drugie_sniadanie_deser", diet: "vegetarian", hasVegFruit: false, allergenNumbers: [1, 3, 7] },
];

async function seedExtras() {
  const allergenRows = await db.select({ id: allergens.id, number: allergens.number }).from(allergens);
  const numberToId = new Map<number, string>();
  for (const r of allergenRows) numberToId.set(r.number, r.id);

  if (numberToId.size === 0) {
    throw new Error("Allergens table is empty — run `npm run seed` first.");
  }

  console.log("→ Inserting extras…");
  let dishesInserted = 0;
  let junctionInserted = 0;
  let dishesSkipped = 0;

  for (const d of EXTRAS) {
    const existing = await db
      .select({ id: globalDishes.id })
      .from(globalDishes)
      .where(eq(globalDishes.displayName, d.name))
      .limit(1);

    if (existing.length > 0) {
      dishesSkipped++;
      continue;
    }

    const id = randomUUID();
    await db.insert(globalDishes).values({
      id,
      displayName: d.name,
      mealType: d.mealType,
      dietType: d.diet,
      hasVegFruit: d.hasVegFruit,
    });
    dishesInserted++;

    for (const n of d.allergenNumbers) {
      const allergenId = numberToId.get(n);
      if (!allergenId) continue;
      await db
        .insert(globalDishAllergens)
        .values({ globalDishId: id, allergenId })
        .onConflictDoNothing();
      junctionInserted++;
    }
  }

  console.log(`  inserted ${dishesInserted} dishes, skipped ${dishesSkipped} (duplicates by name)`);
  console.log(`  inserted ${junctionInserted} allergen links`);
  console.log("✓ Extras seeded.");
}

seedExtras()
  .catch((err) => {
    console.error("Extras seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
