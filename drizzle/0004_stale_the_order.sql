CREATE TABLE `memberIdPhotos` (
	`userId` int NOT NULL,
	`ciphertext` longtext NOT NULL,
	`mimeType` varchar(32) NOT NULL,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memberIdPhotos_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `bookings` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `bookings` ADD `guestAccessHash` varchar(64);