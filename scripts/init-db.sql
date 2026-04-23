-- ============================================================================
-- Menu Catering — inicjalizacja bazy danych (jednorazowo)
-- Wklej calosc do Supabase SQL Editor i odpal "Run"
-- ============================================================================

-- ---------- Typy ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."diet_type" AS ENUM('meat', 'vegetarian', 'fish', 'legumes');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."menu_meal_type" AS ENUM('sniadanie_kolacja', 'drugie_sniadanie_deser', 'obiad_zupa', 'obiad_danie_glowne');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."menu_slot_type" AS ENUM('sniadanie', 'drugie_sniadanie', 'obiad_zupa', 'obiad_danie_glowne', 'podwieczorek', 'kolacja');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."processing_method" AS ENUM('gotowanie', 'duszenie', 'pieczenie', 'smazenie', 'surowe');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------- Tabele ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "allergens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "number" integer NOT NULL,
  "name" text NOT NULL,
  "description" text
);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "selected_model" text DEFAULT 'anthropic/claude-opus-4' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "openrouter_api_key" text
);

CREATE TABLE IF NOT EXISTS "dishes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "meal_type" "menu_meal_type",
  "diet_type" "diet_type",
  "has_veg_fruit" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "global_dishes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "display_name" text NOT NULL,
  "meal_type" "menu_meal_type" NOT NULL,
  "diet_type" "diet_type",
  "has_veg_fruit" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dish_allergens" (
  "dish_id" uuid NOT NULL,
  "allergen_id" uuid NOT NULL,
  CONSTRAINT "dish_allergens_dish_id_allergen_id_pk" PRIMARY KEY("dish_id","allergen_id")
);

CREATE TABLE IF NOT EXISTS "global_dish_allergens" (
  "global_dish_id" uuid NOT NULL,
  "allergen_id" uuid NOT NULL,
  CONSTRAINT "global_dish_allergens_global_dish_id_allergen_id_pk" PRIMARY KEY("global_dish_id","allergen_id")
);

CREATE TABLE IF NOT EXISTS "dish_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dish_id" uuid NOT NULL,
  "ingredient_name" text NOT NULL,
  "quantity" integer,
  "unit" text DEFAULT 'g' NOT NULL,
  "position_order" integer DEFAULT 0 NOT NULL
);

-- Migracja: dodaj position_order gdyby tabela juz istniala bez niej
ALTER TABLE "dish_ingredients" ADD COLUMN IF NOT EXISTS "position_order" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "global_dish_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "global_dish_id" uuid NOT NULL,
  "ingredient_name" text NOT NULL,
  "quantity" integer,
  "unit" text DEFAULT 'g' NOT NULL,
  "position_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "menu_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "date" timestamp NOT NULL,
  "meal_type" "menu_meal_type" NOT NULL,
  "diet_type" "diet_type",
  "display_name" text NOT NULL,
  "source_dish_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "prepared_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "menu_item_id" uuid NOT NULL,
  "name" text NOT NULL,
  "weight_served_g" integer NOT NULL,
  "processing_method" "processing_method" NOT NULL,
  "has_veg_fruit" boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS "raw_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "prepared_product_id" uuid NOT NULL,
  "ingredient_name" text NOT NULL,
  "raw_weight_g" integer NOT NULL,
  "unit" text DEFAULT 'g' NOT NULL
);

CREATE TABLE IF NOT EXISTS "ingredient_allergens" (
  "ingredient_id" uuid NOT NULL,
  "allergen_id" uuid NOT NULL,
  CONSTRAINT "ingredient_allergens_ingredient_id_allergen_id_pk" PRIMARY KEY("ingredient_id","allergen_id")
);

CREATE TABLE IF NOT EXISTS "profiles" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "min_meat_dishes" integer DEFAULT 0,
  "min_vegetarian_dishes" integer DEFAULT 0,
  "min_fish_dishes" integer DEFAULT 0,
  "min_legumes_dishes" integer DEFAULT 0,
  "working_days" integer[] DEFAULT '{1,2,3,4,5}',
  "use_global_dishes" boolean DEFAULT true,
  "logo_url" text
);

CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ---------- Klucze obce -----------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "dish_allergens" ADD CONSTRAINT "dish_allergens_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "dish_allergens" ADD CONSTRAINT "dish_allergens_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "global_dish_allergens" ADD CONSTRAINT "global_dish_allergens_global_dish_id_fk" FOREIGN KEY ("global_dish_id") REFERENCES "public"."global_dishes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "global_dish_allergens" ADD CONSTRAINT "global_dish_allergens_allergen_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "global_dish_ingredients" ADD CONSTRAINT "global_dish_ingredients_global_dish_id_fk" FOREIGN KEY ("global_dish_id") REFERENCES "public"."global_dishes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "prepared_products" ADD CONSTRAINT "prepared_products_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "raw_ingredients" ADD CONSTRAINT "raw_ingredients_prepared_product_id_fk" FOREIGN KEY ("prepared_product_id") REFERENCES "public"."prepared_products"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."raw_ingredients"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_allergen_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------- Dane startowe: 14 alergenow EU 1169 -----------------------------
INSERT INTO "allergens" ("number", "name", "description") VALUES
  (1,  'Gluten',            'Zboza zawierajace gluten: pszenica, zyto, jeczmien, owies, orkisz, kamut'),
  (2,  'Skorupiaki',        'Skorupiaki i produkty pochodne'),
  (3,  'Jaja',              'Jaja i produkty pochodne'),
  (4,  'Ryby',              'Ryby i produkty pochodne'),
  (5,  'Orzeszki ziemne',   'Orzeszki ziemne (arachidowe) i produkty pochodne'),
  (6,  'Soja',              'Soja i produkty pochodne'),
  (7,  'Mleko',             'Mleko i produkty pochodne (laktoza)'),
  (8,  'Orzechy',            'Orzechy: migdaly, laskowe, wloskie, nerkowce, pekan, brazylijskie, pistacje, makadamia'),
  (9,  'Seler',             'Seler i produkty pochodne'),
  (10, 'Gorczyca',          'Gorczyca i produkty pochodne'),
  (11, 'Sezam',             'Nasiona sezamu i produkty pochodne'),
  (12, 'SO2',               'Dwutlenek siarki i siarczyny (>10 mg/kg)'),
  (13, 'Lubin',             'Lubin i produkty pochodne'),
  (14, 'Miczaki',           'Miczaki i produkty pochodne')
ON CONFLICT DO NOTHING;

-- Cleanup: usun duplikaty alergenow zostawiajac najstarszy id.
-- Strategia bez UPDATE (bezpieczna dla PK nawet gdy jest >2 dubli):
-- 1) INSERT canonical-pary dla kazdego parenta, ON CONFLICT DO NOTHING.
-- 2) DELETE wszystkie non-canonical rekordy w junction.
-- 3) DELETE duplikaty w allergens.
DO $$
DECLARE
  canonical uuid;
  dup_number integer;
BEGIN
  FOR dup_number IN SELECT number FROM allergens GROUP BY number HAVING COUNT(*) > 1 LOOP
    SELECT id INTO canonical FROM allergens WHERE number = dup_number ORDER BY id LIMIT 1;

    INSERT INTO ingredient_allergens (ingredient_id, allergen_id)
      SELECT DISTINCT ingredient_id, canonical FROM ingredient_allergens
      WHERE allergen_id IN (SELECT id FROM allergens WHERE number = dup_number AND id <> canonical)
      ON CONFLICT DO NOTHING;
    DELETE FROM ingredient_allergens
      WHERE allergen_id IN (SELECT id FROM allergens WHERE number = dup_number AND id <> canonical);

    INSERT INTO dish_allergens (dish_id, allergen_id)
      SELECT DISTINCT dish_id, canonical FROM dish_allergens
      WHERE allergen_id IN (SELECT id FROM allergens WHERE number = dup_number AND id <> canonical)
      ON CONFLICT DO NOTHING;
    DELETE FROM dish_allergens
      WHERE allergen_id IN (SELECT id FROM allergens WHERE number = dup_number AND id <> canonical);

    INSERT INTO global_dish_allergens (global_dish_id, allergen_id)
      SELECT DISTINCT global_dish_id, canonical FROM global_dish_allergens
      WHERE allergen_id IN (SELECT id FROM allergens WHERE number = dup_number AND id <> canonical)
      ON CONFLICT DO NOTHING;
    DELETE FROM global_dish_allergens
      WHERE allergen_id IN (SELECT id FROM allergens WHERE number = dup_number AND id <> canonical);

    DELETE FROM allergens WHERE number = dup_number AND id <> canonical;
  END LOOP;
END $$;

-- UNIQUE zeby nie powtorzyl sie problem
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergens_number_unique'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_class WHERE relname = 'allergens_number_unique' AND relkind = 'i'
    ) THEN
      ALTER TABLE "allergens" ADD CONSTRAINT "allergens_number_unique"
        UNIQUE USING INDEX "allergens_number_unique";
    ELSE
      ALTER TABLE "allergens" ADD CONSTRAINT "allergens_number_unique" UNIQUE ("number");
    END IF;
  END IF;
END $$;

-- ---------- Rozbicie slotow kalendarza na 6 wartosci ------------------------
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "slot_type" "menu_slot_type";

UPDATE "menu_items" SET "slot_type" = CASE "meal_type"
  WHEN 'sniadanie_kolacja' THEN 'sniadanie'::menu_slot_type
  WHEN 'drugie_sniadanie_deser' THEN 'drugie_sniadanie'::menu_slot_type
  WHEN 'obiad_zupa' THEN 'obiad_zupa'::menu_slot_type
  WHEN 'obiad_danie_glowne' THEN 'obiad_danie_glowne'::menu_slot_type
END
WHERE "slot_type" IS NULL;

ALTER TABLE "menu_items" ALTER COLUMN "slot_type" SET NOT NULL;
ALTER TABLE "menu_items" ALTER COLUMN "slot_type" SET DEFAULT 'obiad_danie_glowne'::menu_slot_type;

-- ---------- Profile: restauracja + wydawane posilki -------------------------
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "restaurant_name" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "served_slots" "menu_slot_type"[]
  DEFAULT ARRAY['sniadanie','drugie_sniadanie','obiad_zupa','obiad_danie_glowne','podwieczorek','kolacja']::menu_slot_type[];
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email_recipients" jsonb DEFAULT '[]'::jsonb;

-- ---------- SMTP settings (admin) -------------------------------------------
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "smtp_host" text;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "smtp_port" integer;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "smtp_user" text;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "smtp_pass" text;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "smtp_from_email" text;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "smtp_from_name" text;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "smtp_secure" boolean DEFAULT true;
