-- Initial schema for OpenTCM (PLAN.md §5).
--
-- Hand-edit vs drizzle-kit generate (drizzle-orm 0.45 cannot emit this):
--   test_steps UNIQUE (test_case_id, position) is DEFERRABLE INITIALLY DEFERRED
--   so two step positions can be swapped inside a single transaction.
-- All other constraints (prefix regex CHECK, trimmed-length CHECKs,
-- UNIQUE NULLS NOT DISTINCT on directories, ON DELETE CASCADE / SET NULL,
-- the listing index) were emitted from src/lib/db/schema.ts.

CREATE TABLE "directories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" bigint NOT NULL,
	"parent_id" bigint,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directories_project_id_parent_id_name_unique" UNIQUE NULLS NOT DISTINCT("project_id","parent_id","name"),
	CONSTRAINT "directories_name_trimmed_length" CHECK (length(trim("directories"."name")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"next_case_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_unique" UNIQUE("name"),
	CONSTRAINT "projects_prefix_unique" UNIQUE("prefix"),
	CONSTRAINT "projects_name_trimmed_length" CHECK (length(trim("projects"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "projects_prefix_format" CHECK ("projects"."prefix" ~ '^[A-Z][A-Z0-9]{1,9}$')
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "test_cases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" bigint NOT NULL,
	"case_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"directory_id" bigint,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_cases_project_id_case_number_unique" UNIQUE("project_id","case_number"),
	CONSTRAINT "test_cases_title_trimmed_length" CHECK (length(trim("test_cases"."title")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "test_steps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "test_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"test_case_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"action" text NOT NULL,
	"expected_result" text,
	CONSTRAINT "test_steps_test_case_id_position_unique" UNIQUE("test_case_id","position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "test_steps_action_trimmed_length" CHECK (length(trim("test_steps"."action")) >= 1)
);
--> statement-breakpoint
ALTER TABLE "directories" ADD CONSTRAINT "directories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directories" ADD CONSTRAINT "directories_parent_id_directories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."directories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_directory_id_directories_id_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."directories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_steps" ADD CONSTRAINT "test_steps_test_case_id_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_cases_project_id_deleted_at_directory_id_index" ON "test_cases" USING btree ("project_id","deleted_at","directory_id");
