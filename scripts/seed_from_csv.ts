import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { db, client } from "../src/db/index";
import {
  allergens,
  dishes,
  dishAllergens,
  globalDishes,
  globalDishAllergens,
} from "../src/db/schema";

type AllergenRow = { id: string; code: string; name: string };
type GlobalDishRow = {
  id: string;
  display_name: string;
  meal_type: string;
  diet_type: string;
  created_at: string;
  has_veg_fruit: string;
};
type JunctionRow = { global_dish_id?: string; dish_id?: string; allergen_id: string };
type DishRow = {
  id: string;
  user_id: string;
  display_name: string;
  created_at: string;
  diet_type: string;
  meal_type: string;
  has_veg_fruit: string;
};

type MealType = "sniadanie_kolacja" | "drugie_sniadanie_deser" | "obiad_zupa" | "obiad_danie_glowne";
type DietType = "meat" | "vegetarian" | "fish" | "legumes" | null;

const VALID_MEAL: MealType[] = ["sniadanie_kolacja", "drugie_sniadanie_deser", "obiad_zupa", "obiad_danie_glowne"];
const VALID_DIET: Exclude<DietType, null>[] = ["meat", "vegetarian", "fish", "legumes"];

const truthy = (v: string | undefined) => v === "t" || v === "true";
const normMeal = (v: string | undefined): MealType | null =>
  v && (VALID_MEAL as string[]).includes(v) ? (v as MealType) : null;
const normDiet = (v: string | undefined): DietType =>
  v && (VALID_DIET as string[]).includes(v) ? (v as DietType) : null;

async function seed() {
  const baseDir = path.join(process.cwd(), "download/database_export");
  if (!fs.existsSync(baseDir)) {
    throw new Error(`Seed source missing: ${baseDir}`);
  }

  // ----------------------------------------------------------------------
  // Alergeny — idempotentnie: jeśli rekord z danym `number` już istnieje,
  // używamy jego uuid; inaczej wstawiamy. Dzięki temu skrypt można odpalić
  // wielokrotnie bez duplikowania.
  // ----------------------------------------------------------------------
  console.log("→ Seeding allergens…");
  const allergenCsv = fs.readFileSync(path.join(baseDir, "allergens.csv"), "utf-8");
  const allergenRows: AllergenRow[] = parse(allergenCsv, { columns: true, skip_empty_lines: true });

  const existingAllergens = await db.select({ id: allergens.id, number: allergens.number }).from(allergens);
  const numberToUuid = new Map<number, string>();
  for (const a of existingAllergens) numberToUuid.set(a.number, a.id);

  const allergenIdMap = new Map<string, string>(); // csvId → uuid
  let insertedAllergens = 0;
  for (const r of allergenRows) {
    const code = parseInt(r.code, 10);
    let uuid = numberToUuid.get(code);
    if (!uuid) {
      const [row] = await db
        .insert(allergens)
        .values({ number: code, name: r.name })
        .returning({ id: allergens.id });
      uuid = row.id;
      numberToUuid.set(code, uuid);
      insertedAllergens++;
    }
    allergenIdMap.set(r.id, uuid);
  }
  console.log(`  inserted ${insertedAllergens}, reused ${allergenIdMap.size - insertedAllergens}`);

  // ----------------------------------------------------------------------
  // Global dishes
  // ----------------------------------------------------------------------
  console.log("→ Seeding global_dishes…");
  const globalDishesCsv = fs.readFileSync(path.join(baseDir, "global_dishes.csv"), "utf-8");
  const globalDishRows: GlobalDishRow[] = parse(globalDishesCsv, { columns: true, skip_empty_lines: true });

  const insertedGlobalIds = new Set<string>();
  for (const r of globalDishRows) {
    const meal = normMeal(r.meal_type);
    if (!meal) continue;
    await db
      .insert(globalDishes)
      .values({
        id: r.id,
        displayName: r.display_name,
        mealType: meal,
        dietType: normDiet(r.diet_type),
        hasVegFruit: truthy(r.has_veg_fruit),
        createdAt: r.created_at ? new Date(r.created_at) : undefined,
      })
      .onConflictDoNothing();
    insertedGlobalIds.add(r.id);
  }
  console.log(`  processed ${insertedGlobalIds.size} global dishes`);

  // ----------------------------------------------------------------------
  // Global dish allergens
  // ----------------------------------------------------------------------
  console.log("→ Seeding global_dish_allergens…");
  const globalJunctionPath = path.join(baseDir, "global_dish_allergens.csv");
  if (fs.existsSync(globalJunctionPath)) {
    const junctionCsv = fs.readFileSync(globalJunctionPath, "utf-8");
    const junctionRows: JunctionRow[] = parse(junctionCsv, { columns: true, skip_empty_lines: true });

    let inserted = 0;
    let skipped = 0;
    for (const r of junctionRows) {
      const mappedAllergenId = allergenIdMap.get(r.allergen_id);
      if (!mappedAllergenId || !r.global_dish_id || !insertedGlobalIds.has(r.global_dish_id)) {
        skipped++;
        continue;
      }
      await db
        .insert(globalDishAllergens)
        .values({ globalDishId: r.global_dish_id, allergenId: mappedAllergenId })
        .onConflictDoNothing();
      inserted++;
    }
    console.log(`  inserted ${inserted} links, skipped ${skipped}`);
  } else {
    console.log("  global_dish_allergens.csv not found, skipping");
  }

  // ----------------------------------------------------------------------
  // User dishes — 106 pozycji z `dishes.csv` (per-user biblioteka).
  // Preserwujemy oryginalne uuid żeby `dish_allergens.csv` mogło się powiązać.
  // user_id zachowujemy z CSV — nawet jeśli user już nie istnieje w profilach,
  // dania są widoczne tylko właścicielowi (filter userId w API).
  // ----------------------------------------------------------------------
  console.log("→ Seeding dishes (user-dishes)…");
  const dishesCsvPath = path.join(baseDir, "dishes.csv");
  const insertedDishIds = new Set<string>();
  if (fs.existsSync(dishesCsvPath)) {
    const dishesCsv = fs.readFileSync(dishesCsvPath, "utf-8");
    const dishRows: DishRow[] = parse(dishesCsv, { columns: true, skip_empty_lines: true });

    let inserted = 0;
    for (const r of dishRows) {
      if (!r.display_name || !r.user_id) continue;
      await db
        .insert(dishes)
        .values({
          id: r.id,
          userId: r.user_id,
          displayName: r.display_name,
          mealType: normMeal(r.meal_type),
          dietType: normDiet(r.diet_type),
          hasVegFruit: truthy(r.has_veg_fruit),
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        })
        .onConflictDoNothing();
      insertedDishIds.add(r.id);
      inserted++;
    }
    console.log(`  processed ${inserted} user-dishes`);
  } else {
    console.log("  dishes.csv not found, skipping");
  }

  // ----------------------------------------------------------------------
  // Dish allergens — per user-dish, wymaga map csv-allergen-id → uuid.
  // ----------------------------------------------------------------------
  console.log("→ Seeding dish_allergens…");
  const dishJunctionPath = path.join(baseDir, "dish_allergens.csv");
  if (fs.existsSync(dishJunctionPath)) {
    const junctionCsv = fs.readFileSync(dishJunctionPath, "utf-8");
    const junctionRows: JunctionRow[] = parse(junctionCsv, { columns: true, skip_empty_lines: true });

    let inserted = 0;
    let skipped = 0;
    for (const r of junctionRows) {
      const mappedAllergenId = allergenIdMap.get(r.allergen_id);
      if (!mappedAllergenId || !r.dish_id || !insertedDishIds.has(r.dish_id)) {
        skipped++;
        continue;
      }
      await db
        .insert(dishAllergens)
        .values({ dishId: r.dish_id, allergenId: mappedAllergenId })
        .onConflictDoNothing();
      inserted++;
    }
    console.log(`  inserted ${inserted} links, skipped ${skipped}`);
  } else {
    console.log("  dish_allergens.csv not found, skipping");
  }

  console.log("✓ Seed complete.");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
