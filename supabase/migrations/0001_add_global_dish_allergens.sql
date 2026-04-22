CREATE TABLE "global_dish_allergens" (
	"global_dish_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL,
	CONSTRAINT "global_dish_allergens_global_dish_id_allergen_id_pk" PRIMARY KEY("global_dish_id","allergen_id")
);
--> statement-breakpoint
ALTER TABLE "global_dish_allergens" ADD CONSTRAINT "global_dish_allergens_global_dish_id_global_dishes_id_fk" FOREIGN KEY ("global_dish_id") REFERENCES "public"."global_dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_dish_allergens" ADD CONSTRAINT "global_dish_allergens_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade ON UPDATE no action;