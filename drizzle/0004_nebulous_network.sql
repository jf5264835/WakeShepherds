CREATE TABLE `google_email_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`encrypted_client_secret` text NOT NULL,
	`client_secret_iv` text NOT NULL,
	`encrypted_refresh_token` text DEFAULT '' NOT NULL,
	`refresh_token_iv` text DEFAULT '' NOT NULL,
	`sender_email` text NOT NULL,
	`connected_email` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
