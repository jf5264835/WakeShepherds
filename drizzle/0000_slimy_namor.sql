CREATE TABLE `care_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`lane` text NOT NULL,
	`need` text DEFAULT '' NOT NULL,
	`last_contact` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`follow_up_date` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`assigned_email` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
