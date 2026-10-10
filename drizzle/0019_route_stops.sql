CREATE TABLE `routeStops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`locationId` int NOT NULL,
	`stopOrder` int NOT NULL,
	`pickupAllowed` boolean NOT NULL DEFAULT true,
	`dropoffAllowed` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routeStops_id` PRIMARY KEY(`id`),
	CONSTRAINT `routeStops_route_order_unique` UNIQUE(`routeId`,`stopOrder`)
);
--> statement-breakpoint
CREATE INDEX `routeStops_route_idx` ON `routeStops` (`routeId`);
--> statement-breakpoint
CREATE INDEX `routeStops_location_idx` ON `routeStops` (`locationId`);
