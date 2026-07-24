CREATE TABLE `planning_center_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`encrypted_client_secret` text NOT NULL,
	`client_secret_iv` text NOT NULL,
	`encrypted_access_token` text DEFAULT '' NOT NULL,
	`access_token_iv` text DEFAULT '' NOT NULL,
	`encrypted_refresh_token` text DEFAULT '' NOT NULL,
	`refresh_token_iv` text DEFAULT '' NOT NULL,
	`token_expires_at` text DEFAULT '' NOT NULL,
	`connected_person_id` text DEFAULT '' NOT NULL,
	`connected_person_name` text DEFAULT '' NOT NULL,
	`organization_id` text DEFAULT '' NOT NULL,
	`organization_name` text DEFAULT '' NOT NULL,
	`connector_token_hash` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
