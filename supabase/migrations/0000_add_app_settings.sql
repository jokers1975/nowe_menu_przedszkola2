CREATE TYPE "public"."diet_type" AS ENUM('meat', 'vegetarian', 'fish', 'legumes');--> statement-breakpoint
CREATE TYPE "public"."menu_meal_type" AS ENUM('sniadanie_kolacja', 'drugie_sniadanie_deser', 'obiad_zupa', 'obiad_danie_glowne');--> statement-breakpoint
CREATE TYPE "public"."processing_method" AS ENUM('gotowanie', 'duszenie', 'pieczenie', 'smazenie', 'surowe');--> statement-breakpoint
CREATE TABLE "allergens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"selected_model" text DEFAULT 'anthropic/claude-opus-4' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dish_allergens" (
	"dish_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL,
	CONSTRAINT "dish_allergens_dish_id_allergen_id_pk" PRIMARY KEY("dish_id","allergen_id")
);
--> statement-breakpoint
CREATE TABLE "dish_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dish_id" uuid NOT NULL,
	"ingredient_name" text NOT NULL,
	"quantity" integer,
	"unit" text DEFAULT 'g' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"meal_type" "menu_meal_type",
	"diet_type" "diet_type",
	"has_veg_fruit" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"meal_type" "menu_meal_type" NOT NULL,
	"diet_type" "diet_type",
	"has_veg_fruit" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_allergens" (
	"ingredient_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL,
	CONSTRAINT "ingredient_allergens_ingredient_id_allergen_id_pk" PRIMARY KEY("ingredient_id","allergen_id")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"meal_type" "menu_meal_type" NOT NULL,
	"diet_type" "diet_type",
	"display_name" text NOT NULL,
	"source_dish_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prepared_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weight_served_g" integer NOT NULL,
	"processing_method" "processing_method" NOT NULL,
	"has_veg_fruit" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "profiles" (
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
--> statement-breakpoint
CREATE TABLE "raw_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prepared_product_id" uuid NOT NULL,
	"ingredient_name" text NOT NULL,
	"raw_weight_g" integer NOT NULL,
	"unit" text DEFAULT 'g' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dish_allergens" ADD CONSTRAINT "dish_allergens_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_allergens" ADD CONSTRAINT "dish_allergens_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_ingredient_id_raw_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."raw_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prepared_products" ADD CONSTRAINT "prepared_products_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_ingredients" ADD CONSTRAINT "raw_ingredients_prepared_product_id_prepared_products_id_fk" FOREIGN KEY ("prepared_product_id") REFERENCES "public"."prepared_products"("id") ON DELETE cascade ON UPDATE no action;