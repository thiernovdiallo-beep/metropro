ALTER TABLE `departures` MODIFY COLUMN `capacity` int NOT NULL DEFAULT 11;--> statement-breakpoint
ALTER TABLE `vehicles` MODIFY COLUMN `capacity` int NOT NULL DEFAULT 11;