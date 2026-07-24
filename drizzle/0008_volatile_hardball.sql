CREATE TABLE `youth_care` (
	`id` text PRIMARY KEY NOT NULL,
	`person_type` text DEFAULT 'student' NOT NULL,
	`name` text NOT NULL,
	`subject_user_id` text DEFAULT '' NOT NULL,
	`school` text DEFAULT '' NOT NULL,
	`birthday` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Discipleship' NOT NULL,
	`need` text DEFAULT '' NOT NULL,
	`last_contact` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`follow_up_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`assigned_user_id` text DEFAULT '' NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`birthday_acknowledged_year` integer DEFAULT 0 NOT NULL,
	`archived_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `can_access_youth` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `can_manage_youth` integer DEFAULT false NOT NULL;