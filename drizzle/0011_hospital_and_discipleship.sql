CREATE TABLE `discipleship_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`ministry` text DEFAULT 'Wake Men' NOT NULL,
	`disciple_name` text NOT NULL,
	`disciple_phone` text DEFAULT '' NOT NULL,
	`disciple_email` text DEFAULT '' NOT NULL,
	`disciple_maker_user_id` text NOT NULL,
	`disciple_maker_name` text NOT NULL,
	`started_at` text DEFAULT '' NOT NULL,
	`last_contact` text DEFAULT '' NOT NULL,
	`next_meetup_date` text DEFAULT '' NOT NULL,
	`growth_needed` text DEFAULT '[]' NOT NULL,
	`growth_seen` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`meetup_count` integer DEFAULT 0 NOT NULL,
	`coach_contacted_at` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`archived_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hospital_care` (
	`id` text PRIMARY KEY NOT NULL,
	`person_name` text NOT NULL,
	`age` text DEFAULT '' NOT NULL,
	`hospital_name` text NOT NULL,
	`hospital_address` text NOT NULL,
	`room_number` text DEFAULT '' NOT NULL,
	`situation` text DEFAULT '' NOT NULL,
	`incident_date` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_phone` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`relationship` text DEFAULT '' NOT NULL,
	`visit_guidance` text DEFAULT '' NOT NULL,
	`last_contact` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`follow_up_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`assigned_user_id` text DEFAULT '' NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`archived_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hospital_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`resource_type` text DEFAULT 'Article' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`published_by` text DEFAULT '' NOT NULL,
	`archived_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `can_access_hospital` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `can_manage_hospital` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `can_access_discipleship` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `can_manage_discipleship` integer DEFAULT false NOT NULL;