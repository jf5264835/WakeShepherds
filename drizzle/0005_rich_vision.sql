ALTER TABLE `users` ADD `notification_email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `notification_email` = 'kai@wakechurch.com' WHERE `email` = 'global-admin';
--> statement-breakpoint
UPDATE `users` SET `notification_email` = `email` WHERE `notification_email` = '' AND `email` != 'global-admin';
