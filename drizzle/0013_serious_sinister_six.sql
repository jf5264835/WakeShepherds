CREATE TABLE `care_team_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`assignment_id` text NOT NULL,
	`person_name` text NOT NULL,
	`sender_user_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`kind` text DEFAULT 'message' NOT NULL,
	`message` text NOT NULL,
	`urgency` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`resolved_by` text DEFAULT '' NOT NULL,
	`resolved_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hospital_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`hospital_care_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `hospital_care` ADD `expected_discharge_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hospital_care` ADD `discharged_at` text DEFAULT '' NOT NULL;