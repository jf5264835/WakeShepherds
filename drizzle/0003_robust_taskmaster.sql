CREATE TABLE `care_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text DEFAULT 'System' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `care_categories_name_unique` ON `care_categories` (`name`);--> statement-breakpoint
ALTER TABLE `care_items` ADD `category` text DEFAULT '' NOT NULL;