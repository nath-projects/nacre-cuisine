CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`book_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	PRIMARY KEY(`book_id`, `recipe_id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`owner` text NOT NULL,
	`recipe_id` text NOT NULL,
	`text` text NOT NULL,
	`cooked` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `recipe_id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`recipe_id` text NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
