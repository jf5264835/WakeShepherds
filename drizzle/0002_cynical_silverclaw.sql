ALTER TABLE `care_items` ADD `archived_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `care_items` ADD `archived_by` text DEFAULT '' NOT NULL;