CREATE TABLE `adminSetupInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` datetime NOT NULL,
	`consumedAt` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminSetupInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `adminSetupInvites_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `adminSetupInvites` ADD CONSTRAINT `adminSetupInvites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `adminSetupInvites_userId_idx` ON `adminSetupInvites` (`userId`);