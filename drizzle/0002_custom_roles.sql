-- Custom roles (PLAN-v1.1.md §4). Forward-only on 0001_auth_history.sql.
-- Admin is locked. Member and Viewer ship built-in and may be deleted when unused.

CREATE TABLE "roles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"built_in" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"permissions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_name_trimmed_length" CHECK (length(trim("roles"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "roles_slug_format" CHECK ("roles"."slug" ~ '^[a-z][a-z0-9-]{0,39}$')
);
--> statement-breakpoint
INSERT INTO "roles" ("slug", "name", "description", "built_in", "locked", "permissions") VALUES
	('admin', 'Admin', 'Full instance access. Cannot be deleted.', true, true, '["cases.write","cases.revert","directories.write","cases.bulk","trash.purge","projects.write"]'::jsonb),
	('member', 'Member', 'Create and edit test cases and folders.', true, false, '["cases.write","cases.revert","directories.write","cases.bulk"]'::jsonb),
	('viewer', 'Viewer', 'Read-only access.', true, false, '[]'::jsonb);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_roles_slug_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("slug") ON DELETE restrict ON UPDATE no action;
