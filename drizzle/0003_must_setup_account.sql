-- Bootstrap Admin must replace temporary credentials on first sign-in.
ALTER TABLE "users" ADD COLUMN "must_setup_account" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "users" SET "must_setup_account" = true WHERE lower("email") = 'admin@opentcm.io';
