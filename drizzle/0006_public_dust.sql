CREATE TABLE `maternal_care` (
	`id` text PRIMARY KEY NOT NULL,
	`mom_name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'trying' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`baby_born_date` text DEFAULT '' NOT NULL,
	`baby_name` text DEFAULT '' NOT NULL,
	`meal_train_form_url` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`assigned_user_id` text DEFAULT '' NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`archived_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maternal_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`maternal_care_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `allowed_categories` text DEFAULT '[]' NOT NULL;