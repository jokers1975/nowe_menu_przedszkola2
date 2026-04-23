import { db } from "@/db";
import {
  allergens,
  dishAllergens,
  dishes as userDishes,
  dishIngredients,
  globalDishAllergens,
  globalDishes,
  globalDishIngredients,
} from "@/db/schema";
import { asc } from "drizzle-orm";
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

    // Pobieramy składniki w osobnych zapytaniach (uniknięcie cartesian product z allergen-join)
    const dishIds = [...dishMap.keys()];
    const ingredientsByDish = new Map<string, Array<{ name: string; quantity: number | null; unit: string; position: number }>>();

    if (dishIds.length > 0) {
      const globalIng = await db
        .select({
          dishId: globalDishIngredients.globalDishId,
          name: globalDishIngredients.ingredientName,
          quantity: globalDishIngredients.quantity,
          unit: globalDishIngredients.unit,
          position: globalDishIngredients.positionOrder,
        })
        .from(globalDishIngredients)
        .where(inArray(globalDishIngredients.globalDishId, dishIds))
        .orderBy(asc(globalDishIngredients.positionOrder));

      for (const r of globalIng) {
        const arr = ingredientsByDish.get(r.dishId) ?? [];
        arr.push({ name: r.name, quantity: r.quantity, unit: r.unit, position: r.position });
        ingredientsByDish.set(r.dishId, arr);
      }

      if (currentUserId) {
        const userIng = await db
          .select({
            dishId: dishIngredients.dishId,
            name: dishIngredients.ingredientName,
            quantity: dishIngredients.quantity,
            unit: dishIngredients.unit,
            position: dishIngredients.positionOrder,
          })
          .from(dishIngredients)
          .where(inArray(dishIngredients.dishId, dishIds))
          .orderBy(asc(dishIngredients.positionOrder));

        for (const r of userIng) {
          const arr = ingredientsByDish.get(r.dishId) ?? [];
          arr.push({ name: r.name, quantity: r.quantity, unit: r.unit, position: r.position });
          ingredientsByDish.set(r.dishId, arr);
        }
      }
    }

    const dishes = [...dishMap.values()]
      .map((d) => ({
        ...d,
        allergens: d.allergens.sort((a, b) => a - b),
        ingredients: (ingredientsByDish.get(d.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map(({ name, quantity, unit }) => ({ name, quantity, unit })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));

    return Response.json({ dishes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/dishes GET error:", err);
    return Response.json({ error: "Nie można pobrać listy dań.", details: message }, { status: 500 });
  }
}

type IngredientInput = {
  name?: string;
  quantity?: number | null;
  unit?: string;
};

type UpsertBody = {
  id?: string;
  displayName?: string;
  mealType?: string;
  dietType?: string | null;
  hasVegFruit?: boolean;
  allergenIds?: string[];
  ingredients?: IngredientInput[];
};

async function upsertDish(body: UpsertBody, existingId: string | null, actingUserId: string) {
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
  const ingredients = Array.isArray(body.ingredients)
    ? body.ingredients
        .map((i) => ({
          name: typeof i.name === "string" ? i.name.trim() : "",
          quantity: typeof i.quantity === "number" && Number.isFinite(i.quantity) ? Math.round(i.quantity) : null,
          unit: typeof i.unit === "string" && i.unit.trim() ? i.unit.trim() : "g",
        }))
        .filter((i) => i.name.length > 0)
    : [];

  // Sprawdź czy existingId to user-dish (właściciel = acting user) czy global.
  let target: "global" | "user" = "global";
  if (existingId) {
    const [userRow] = await db
      .select({ id: userDishes.id, userId: userDishes.userId })
      .from(userDishes)
      .where(eq(userDishes.id, existingId));
    if (userRow) {
      if (userRow.userId !== actingUserId) throw new Error("Brak uprawnień do edycji tego dania");
      target = "user";
    }
  }

  return await db.transaction(async (tx) => {
    let dishId = existingId;
    if (target === "user") {
      await tx
        .update(userDishes)
        .set({ displayName: name, mealType: body.mealType as MealType, dietType: diet, hasVegFruit: vegFruit })
        .where(eq(userDishes.id, dishId!));
      await tx.delete(dishAllergens).where(eq(dishAllergens.dishId, dishId!));
    } else if (dishId) {
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
        if (target === "user") {
          await tx.insert(dishAllergens).values(
            valid.map((a) => ({ dishId: dishId!, allergenId: a.id })),
          );
        } else {
          await tx.insert(globalDishAllergens).values(
            valid.map((a) => ({ globalDishId: dishId!, allergenId: a.id })),
          );
        }
      }
    }

    // Składniki: replace-all strategia (usuń i wstaw na nowo w kolejności z tablicy)
    if (target === "user") {
      await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, dishId!));
      if (ingredients.length > 0) {
        await tx.insert(dishIngredients).values(
          ingredients.map((ing, idx) => ({
            dishId: dishId!,
            ingredientName: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            positionOrder: idx,
          })),
        );
      }
    } else {
      await tx.delete(globalDishIngredients).where(eq(globalDishIngredients.globalDishId, dishId!));
      if (ingredients.length > 0) {
        await tx.insert(globalDishIngredients).values(
          ingredients.map((ing, idx) => ({
            globalDishId: dishId!,
            ingredientName: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            positionOrder: idx,
          })),
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
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const body = (await request.json()) as UpsertBody;
    const id = await upsertDish(body, null, user.id);
    return Response.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const body = (await request.json()) as UpsertBody;
    if (!body.id || typeof body.id !== "string") {
      return Response.json({ error: "id wymagane" }, { status: 400 });
    }
    // Global dish → wymagany admin. User-dish → wystarczy że zalogowany (własność sprawdzana w upsertDish).
    const [userRow] = await db
      .select({ id: userDishes.id })
      .from(userDishes)
      .where(eq(userDishes.id, body.id));
    if (!userRow) {
      const admin = await checkAdmin();
      if (!admin) return forbiddenResponse();
    }
    const id = await upsertDish(body, body.id, user.id);
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
