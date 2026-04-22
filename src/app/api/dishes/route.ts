import { db } from "@/db";
import {
  allergens,
  dishAllergens,
  dishes as userDishes,
  globalDishAllergens,
  globalDishes,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import {
  checkAdmin,
  getCurrentUser,
  getCurrentUserId,
  UnauthorizedError,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";

async function ensureAdminOrForbidden() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  const admin = await checkAdmin();
  if (!admin) return forbiddenResponse();
  return null;
}

const VALID_MEAL_TYPES = [
  "sniadanie_kolacja",
  "drugie_sniadanie_deser",
  "obiad_zupa",
  "obiad_danie_glowne",
] as const;

const VALID_DIETS = ["meat", "vegetarian", "fish", "legumes"] as const;

type MealType = (typeof VALID_MEAL_TYPES)[number];
type DietType = (typeof VALID_DIETS)[number];

function isMealType(v: unknown): v is MealType {
  return typeof v === "string" && (VALID_MEAL_TYPES as readonly string[]).includes(v);
}

function isDietType(v: unknown): v is DietType {
  return typeof v === "string" && (VALID_DIETS as readonly string[]).includes(v);
}

export async function GET(request: NextRequest) {
  try {
    const mealType = request.nextUrl.searchParams.get("mealType");

    // Globalny katalog (widoczny dla wszystkich)
    const globalBase = db
      .select({
        id: globalDishes.id,
        name: globalDishes.displayName,
        type: globalDishes.mealType,
        diet: globalDishes.dietType,
        vegFruit: globalDishes.hasVegFruit,
        allergenNumber: allergens.number,
        allergenId: allergens.id,
      })
      .from(globalDishes)
      .leftJoin(globalDishAllergens, eq(globalDishAllergens.globalDishId, globalDishes.id))
      .leftJoin(allergens, eq(allergens.id, globalDishAllergens.allergenId));

    const globalRows = isMealType(mealType)
      ? await globalBase.where(eq(globalDishes.mealType, mealType))
      : await globalBase;

    // User-dishes (per-user biblioteka z reimportu CSV — 106 pozycji)
    // Filtrujemy po userId. Jeśli user nie jest zalogowany, pomijamy — picker
    // nadal dostaje global.
    type Row = {
      id: string;
      name: string;
      type: MealType | null;
      diet: DietType | null;
      vegFruit: boolean | null;
      allergenNumber: number | null;
      allergenId: string | null;
    };
    let userRows: Row[] = [];
    let currentUserId: string | null = null;
    try {
      currentUserId = await getCurrentUserId();
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) throw err;
    }

    if (currentUserId) {
      const userBase = db
        .select({
          id: userDishes.id,
          name: userDishes.displayName,
          type: userDishes.mealType,
          diet: userDishes.dietType,
          vegFruit: userDishes.hasVegFruit,
          allergenNumber: allergens.number,
          allergenId: allergens.id,
        })
        .from(userDishes)
        .leftJoin(dishAllergens, eq(dishAllergens.dishId, userDishes.id))
        .leftJoin(allergens, eq(allergens.id, dishAllergens.allergenId));

      userRows = isMealType(mealType)
        ? await userBase.where(
            and(eq(userDishes.userId, currentUserId), eq(userDishes.mealType, mealType)),
          )
        : await userBase.where(eq(userDishes.userId, currentUserId));
    }

    const dishMap = new Map<string, {
      id: string;
      name: string;
      type: string | null;
      diet: string | null;
      vegFruit: boolean;
      allergens: number[];
      allergenIds: string[];
    }>();

    for (const r of [...globalRows, ...userRows]) {
      if (!r.type) continue;
      let dish = dishMap.get(r.id);
      if (!dish) {
        dish = {
          id: r.id,
          name: r.name,
          type: r.type,
          diet: r.diet,
          vegFruit: r.vegFruit ?? false,
          allergens: [],
          allergenIds: [],
        };
        dishMap.set(r.id, dish);
      }
      if (r.allergenNumber !== null && !dish.allergens.includes(r.allergenNumber)) {
        dish.allergens.push(r.allergenNumber);
      }
      if (r.allergenId !== null && !dish.allergenIds.includes(r.allergenId)) {
        dish.allergenIds.push(r.allergenId);
      }
    }

    const dishes = [...dishMap.values()]
      .map((d) => ({ ...d, allergens: d.allergens.sort((a, b) => a - b) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));

    return Response.json({ dishes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/dishes GET error:", err);
    return Response.json({ error: "Nie można pobrać listy dań.", details: message }, { status: 500 });
  }
}

type UpsertBody = {
  id?: string;
  displayName?: string;
  mealType?: string;
  dietType?: string | null;
  hasVegFruit?: boolean;
  allergenIds?: string[];
};

async function upsertDish(body: UpsertBody, existingId: string | null) {
  const name = body.displayName?.trim();
  if (!name) throw new Error("Nazwa wymagana");
  if (!isMealType(body.mealType)) throw new Error("mealType nieprawidłowy");
  const diet: DietType | null =
    body.dietType === null || body.dietType === undefined || body.dietType === ""
      ? null
      : isDietType(body.dietType)
        ? body.dietType
        : (() => { throw new Error("dietType nieprawidłowy"); })();

  const vegFruit = Boolean(body.hasVegFruit);
  const allergenIds = Array.isArray(body.allergenIds) ? body.allergenIds.filter((x) => typeof x === "string") : [];

  return await db.transaction(async (tx) => {
    let dishId = existingId;
    if (dishId) {
      await tx
        .update(globalDishes)
        .set({ displayName: name, mealType: body.mealType as MealType, dietType: diet, hasVegFruit: vegFruit })
        .where(eq(globalDishes.id, dishId));
      await tx.delete(globalDishAllergens).where(eq(globalDishAllergens.globalDishId, dishId));
    } else {
      const [inserted] = await tx
        .insert(globalDishes)
        .values({ displayName: name, mealType: body.mealType as MealType, dietType: diet, hasVegFruit: vegFruit })
        .returning({ id: globalDishes.id });
      dishId = inserted.id;
    }

    if (allergenIds.length > 0) {
      const valid = await tx
        .select({ id: allergens.id })
        .from(allergens)
        .where(inArray(allergens.id, allergenIds));
      if (valid.length > 0) {
        await tx.insert(globalDishAllergens).values(
          valid.map((a) => ({ globalDishId: dishId!, allergenId: a.id })),
        );
      }
    }
    return dishId;
  });
}

export async function POST(request: NextRequest) {
  const guard = await ensureAdminOrForbidden();
  if (guard) return guard;
  try {
    const body = (await request.json()) as UpsertBody;
    const id = await upsertDish(body, null);
    return Response.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await ensureAdminOrForbidden();
  if (guard) return guard;
  try {
    const body = (await request.json()) as UpsertBody;
    if (!body.id || typeof body.id !== "string") {
      return Response.json({ error: "id wymagane" }, { status: 400 });
    }
    const id = await upsertDish(body, body.id);
    return Response.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await ensureAdminOrForbidden();
  if (guard) return guard;
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "id wymagane" }, { status: 400 });
    await db.delete(globalDishes).where(eq(globalDishes.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
