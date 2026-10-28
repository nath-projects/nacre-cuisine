ALTER TABLE `accounts` ADD `auth_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `auth_version` integer DEFAULT 0 NOT NULL;