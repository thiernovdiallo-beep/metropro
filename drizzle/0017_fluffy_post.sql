ALTER TABLE `cities` ADD `latitude` double;--> statement-breakpoint
ALTER TABLE `cities` ADD `longitude` double;--> statement-breakpoint
ALTER TABLE `locations` ADD `latitude` double;--> statement-breakpoint
ALTER TABLE `locations` ADD `longitude` double;--> statement-breakpoint
ALTER TABLE `locations` ADD `placeId` varchar(255);