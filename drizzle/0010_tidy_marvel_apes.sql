CREATE TABLE `driverPrivateProfiles` (
	`profileId` int NOT NULL,
	`idCiphertext` varchar(512) NOT NULL,
	`idLast4` varchar(4) NOT NULL,
	`photoCiphertext` longtext NOT NULL,
	`photoMimeType` varchar(32) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driverPrivateProfiles_profileId` PRIMARY KEY(`profileId`)
);
--> statement-breakpoint
CREATE TABLE `driverSetupInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` datetime NOT NULL,
	`consumedAt` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driverSetupInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `driverSetupInvites_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `tickets` MODIFY COLUMN `status` enum('booked','checked_in','boarded','no_show','voided') NOT NULL DEFAULT 'booked';--> statement-breakpoint
ALTER TABLE `tickets` ADD `boardedAt` datetime;--> statement-breakpoint
ALTER TABLE `driverPrivateProfiles` ADD CONSTRAINT `driverPrivateProfiles_profileId_driverProfiles_id_fk` FOREIGN KEY (`profileId`) REFERENCES `driverProfiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driverSetupInvites` ADD CONSTRAINT `driverSetupInvites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `driverSetupInvites_userId_idx` ON `driverSetupInvites` (`userId`);