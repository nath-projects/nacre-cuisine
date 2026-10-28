CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`recovery_hash` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE TABLE `auth_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `family_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`target_id` text,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`used_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_invites_code_hash_unique` ON `family_invites` (`code_hash`);--> statement-breakpoint
CREATE TABLE `family_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`joined` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `family_recipes` (
	`family_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`added_by` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`family_id`, `recipe_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL,
	`created` integer NOT NULL
);
