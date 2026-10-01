CREATE TABLE `memberCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`emailNormalized` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memberCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `memberCredentials_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `memberCredentials_email_unique` UNIQUE(`emailNormalized`)
);
--> statement-breakpoint
ALTER TABLE `memberCredentials` ADD CONSTRAINT `memberCredentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;