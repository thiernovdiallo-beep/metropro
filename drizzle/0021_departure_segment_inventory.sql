CREATE TABLE `departureSegmentInventory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`departureId` int NOT NULL,
	`segmentOrder` int NOT NULL,
	`fromLocationId` int NOT NULL,
	`toLocationId` int NOT NULL,
	`capacity` int NOT NULL,
	`seatsSold` int NOT NULL DEFAULT 0,
	`seatsHeld` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `departureSegmentInventory_id` PRIMARY KEY(`id`),
	CONSTRAINT `departureSegmentInventory_departure_order_unique` UNIQUE(`departureId`,`segmentOrder`)
);
--> statement-breakpoint
CREATE INDEX `departureSegmentInventory_departure_idx` ON `departureSegmentInventory` (`departureId`);
--> statement-breakpoint
CREATE INDEX `departureSegmentInventory_locations_idx` ON `departureSegmentInventory` (`fromLocationId`,`toLocationId`);
