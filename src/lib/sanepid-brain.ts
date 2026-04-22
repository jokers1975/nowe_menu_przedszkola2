import { format } from "date-fns";

export type MealType = "sniadanie_kolacja" | "drugie_sniadanie_deser" | "obiad_zupa" | "obiad_danie_glowne";
export type DietType = "meat" | "vegetarian" | "fish" | "legumes" | null;
export type ProcessingMethod = "gotowanie" | "duszenie" | "pieczenie" | "smazenie" | "surowe";

export interface RawIngredient {
  id: string;
  name: string;
  rawWeightG: number;
  unit: string;
  allergens: number[];
}

export interface PreparedProduct {
  id: string;
  name: string;
  weightServedG: number;
  processingMethod: ProcessingMethod;
  hasVegFruit: boolean;
  rawIngredients: RawIngredient[];
}

export interface Dish {
  id: string | number;
  name: string;
  type: MealType;
  diet: DietType;
  vegFruit: boolean;
  allergens: number[];
  processingMethod?: ProcessingMethod;
  preparedProducts?: PreparedProduct[];
}

export interface DaySchedule {
  date: Date;
  meals: Partial<Record<MealType, Dish>>;
}

export interface WeeklyValidation {
  errors: string[];
  warnings: string[];
  summary: {
    totalMeat: number;
    totalVeg: number;
    totalFish: number;
    totalLegumes: number;
  };
  dailyIssues: Record<string, string[]>;
}

const UNIQUENESS_WINDOW_DAYS = 10;

export function validateWeek(schedule: DaySchedule[]): WeeklyValidation {
  const result: WeeklyValidation = {
    errors: [],
    warnings: [],
    summary: { totalMeat: 0, totalVeg: 0, totalFish: 0, totalLegumes: 0 },
    dailyIssues: {}
  };

  let fryingCount = 0;

  // 10-dniowe okno przesuwne: mapuje nazwa dania -> lista indeksów dni (0-based w ramach schedule)
  // w których danie wystąpiło. Naruszenie gdy max - min < UNIQUENESS_WINDOW_DAYS.
  const dishAppearances = new Map<string, number[]>();
  const reportedDuplicates = new Set<string>();

  schedule.forEach((daySchedule, dayIndex) => {
    const dayKey = format(daySchedule.date, 'yyyy-MM-dd');
    result.dailyIssues[dayKey] = [];

    const hasSoup = !!daySchedule.meals["obiad_zupa"];
    const hasMain = !!daySchedule.meals["obiad_danie_glowne"];
    let dailyVegFruitCount = 0;

    Object.values(daySchedule.meals).forEach(dish => {
      if (!dish) return;

      const key = dish.name.toLowerCase();
      const prior = dishAppearances.get(key) ?? [];
      const tooClose = prior.some(idx => dayIndex - idx < UNIQUENESS_WINDOW_DAYS);
      if (tooClose && !reportedDuplicates.has(key)) {
        result.warnings.push(
          `Danie "${dish.name}" powtarza się w oknie ${UNIQUENESS_WINDOW_DAYS} dni roboczych.`
        );
        reportedDuplicates.add(key);
      }
      dishAppearances.set(key, [...prior, dayIndex]);

      const isFried = dish.preparedProducts?.length
        ? dish.preparedProducts.some((p) => p.processingMethod === "smazenie")
        : dish.processingMethod === "smazenie";
      if (isFried) fryingCount++;

      if (dish.type === "obiad_danie_glowne" && dish.diet) {
        if (dish.diet === "meat") result.summary.totalMeat++;
        if (dish.diet === "vegetarian") result.summary.totalVeg++;
        if (dish.diet === "fish") result.summary.totalFish++;
        if (dish.diet === "legumes") result.summary.totalLegumes++;
      }

      const hasVegFruit = dish.preparedProducts?.length
        ? dish.preparedProducts.some((p) => p.hasVegFruit)
        : dish.vegFruit;
      if (hasVegFruit) dailyVegFruitCount++;
    });

    if ((hasSoup || hasMain) && dailyVegFruitCount === 0) {
      result.dailyIssues[dayKey].push("Brak warzyw lub owoców w obiedzie!");
    }
  });

  if (fryingCount > 1) {
    result.errors.push(`Przekroczono limit smażenia: ${fryingCount}/1 na tydzień.`);
  }

  if (result.summary.totalFish < 1) {
    result.warnings.push("Zalecam zaplanować przynajmniej jedno danie rybne w tym tygodniu.");
  }

  return result;
}
