import { pgTable, text, timestamp, boolean, uuid, integer, decimal, pgEnum, primaryKey, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ===== APP SETTINGS (single-row, admin-managed) =====
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1), // enforced single row via CHECK in migration
  selectedModel: text("selected_model").notNull().default("google/gemini-2.5-flash"),
  openrouterApiKey: text("openrouter_api_key"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpFromEmail: text("smtp_from_email"),
  smtpFromName: text("smtp_from_name"),
  smtpSecure: boolean("smtp_secure").default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mealTypeEnum = pgEnum("menu_meal_type", ["sniadanie_kolacja", "drugie_sniadanie_deser", "obiad_zupa", "obiad_danie_glowne"]);
export const slotTypeEnum = pgEnum("menu_slot_type", ["sniadanie", "drugie_sniadanie", "obiad_zupa", "obiad_danie_glowne", "podwieczorek", "kolacja"]);
export const dietTypeEnum = pgEnum("diet_type", ["meat", "vegetarian", "fish", "legumes"]);
export const processingMethodEnum = pgEnum("processing_method", ["gotowanie", "duszenie", "pieczenie", "smazenie", "surowe"]);

// ===== AUTH / PROFILES =====
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(), // tied to auth.users in supabase
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  minMeatDishes: integer("min_meat_dishes").default(0),
  minVegetarianDishes: integer("min_vegetarian_dishes").default(0),
  minFishDishes: integer("min_fish_dishes").default(0),
  minLegumesDishes: integer("min_legumes_dishes").default(0),
  workingDays: integer("working_days").array().default([1,2,3,4,5]), // Mon-Fri
  useGlobalDishes: boolean("use_global_dishes").default(true),
  logoUrl: text("logo_url"),
  restaurantName: text("restaurant_name"),
  servedSlots: slotTypeEnum("served_slots").array().default(["sniadanie", "drugie_sniadanie", "obiad_zupa", "obiad_danie_glowne", "podwieczorek", "kolacja"]),
  emailRecipients: jsonb("email_recipients").$type<{ label: string; email: string }[]>().default([]),
});

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull(), // 'super_admin' | 'admin'
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// ===== ALLERGENS (Global public readable) =====
export const allergens = pgTable("allergens", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: integer("number").notNull().unique(),
  name: text("name").notNull(),
  description: text("description")
});

// ===== DISHES LIBRARY =====
export const globalDishes = pgTable("global_dishes", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  mealType: mealTypeEnum("meal_type").notNull(),
  dietType: dietTypeEnum("diet_type"),
  hasVegFruit: boolean("has_veg_fruit").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const dishes = pgTable("dishes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  displayName: text("display_name").notNull(),
  mealType: mealTypeEnum("meal_type"),
  dietType: dietTypeEnum("diet_type"),
  hasVegFruit: boolean("has_veg_fruit").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const dishIngredients = pgTable("dish_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  dishId: uuid("dish_id").notNull().references(() => dishes.id, { onDelete: "cascade" }),
  ingredientName: text("ingredient_name").notNull(),
  quantity: integer("quantity"),
  unit: text("unit").default("g").notNull(),
  positionOrder: integer("position_order").default(0).notNull(),
});

export const globalDishIngredients = pgTable("global_dish_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  globalDishId: uuid("global_dish_id").notNull().references(() => globalDishes.id, { onDelete: "cascade" }),
  ingredientName: text("ingredient_name").notNull(),
  quantity: integer("quantity"),
  unit: text("unit").default("g").notNull(),
  positionOrder: integer("position_order").default(0).notNull(),
});

export const dishAllergens = pgTable("dish_allergens", {
  dishId: uuid("dish_id").notNull().references(() => dishes.id, { onDelete: "cascade" }),
  allergenId: uuid("allergen_id").notNull().references(() => allergens.id, { onDelete: "cascade" })
}, (t) => ({
  pk: primaryKey({ columns: [t.dishId, t.allergenId] })
}));

export const globalDishAllergens = pgTable("global_dish_allergens", {
  globalDishId: uuid("global_dish_id").notNull().references(() => globalDishes.id, { onDelete: "cascade" }),
  allergenId: uuid("allergen_id").notNull().references(() => allergens.id, { onDelete: "cascade" })
}, (t) => ({
  pk: primaryKey({ columns: [t.globalDishId, t.allergenId] })
}));

// ===== LAYER 1: Menu Items (entries in calendar) =====
export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  date: timestamp("date", { mode: 'string' }).notNull(), // string allows YYYY-MM-DD
  mealType: mealTypeEnum("meal_type").notNull(), // pool dania (4-wartościowy)
  slotType: slotTypeEnum("slot_type").notNull().default("obiad_danie_glowne"), // sloty kalendarza (6-wartościowy)
  dietType: dietTypeEnum("diet_type"),
  displayName: text("display_name").notNull(),
  sourceDishId: uuid("source_dish_id"), // if derived from library
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== LAYER 2: Prepared Products (within a Menu Item) =====
export const preparedProducts = pgTable("prepared_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  menuItemId: uuid("menu_item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  weightServedG: integer("weight_served_g").notNull(),
  processingMethod: processingMethodEnum("processing_method").notNull(),
  hasVegFruit: boolean("has_veg_fruit").default(false),
});

// ===== LAYER 3: Raw Ingredients (within a Prepared Product) =====
export const rawIngredients = pgTable("raw_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  preparedProductId: uuid("prepared_product_id").notNull().references(() => preparedProducts.id, { onDelete: "cascade" }),
  ingredientName: text("ingredient_name").notNull(),
  rawWeightG: integer("raw_weight_g").notNull(),
  unit: text("unit").default("g").notNull(),
});

// ===== N:M: Raw Ingredient Allergens =====
export const ingredientAllergens = pgTable("ingredient_allergens", {
  ingredientId: uuid("ingredient_id").notNull().references(() => rawIngredients.id, { onDelete: "cascade" }),
  allergenId: uuid("allergen_id").notNull().references(() => allergens.id, { onDelete: "cascade" })
}, (t) => ({
  pk: primaryKey({ columns: [t.ingredientId, t.allergenId] })
}));

// ===== RELATIONS CONFIG FOR ORM SELECTS =====
export const menuItemsRelations = relations(menuItems, ({ many }) => ({
  products: many(preparedProducts)
}));

export const preparedProductsRelations = relations(preparedProducts, ({ one, many }) => ({
  menuItem: one(menuItems, {
    fields: [preparedProducts.menuItemId],
    references: [menuItems.id]
  }),
  rawIngredients: many(rawIngredients)
}));

export const rawIngredientsRelations = relations(rawIngredients, ({ one, many }) => ({
  product: one(preparedProducts, {
    fields: [rawIngredients.preparedProductId],
    references: [preparedProducts.id]
  }),
  allergens: many(ingredientAllergens)
}));

export const ingredientAllergensRelations = relations(ingredientAllergens, ({ one }) => ({
  ingredient: one(rawIngredients, {
    fields: [ingredientAllergens.ingredientId],
    references: [rawIngredients.id]
  }),
  allergen: one(allergens, {
    fields: [ingredientAllergens.allergenId],
    references: [allergens.id]
  })
}));
