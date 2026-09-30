CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(40) NOT NULL,
	`entityId` varchar(40) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bookingNumber` varchar(24) NOT NULL,
	`userId` int NOT NULL,
	`outboundDepartureId` int NOT NULL,
	`returnDepartureId` int,
	`tripType` enum('one_way','round_trip') NOT NULL,
	`passengerCount` int NOT NULL,
	`fareType` enum('standard','member') NOT NULL,
	`amountCents` int NOT NULL,
	`status` enum('pending_payment','confirmed','canceled','refunded') NOT NULL DEFAULT 'pending_payment',
	`contactFirstName` varchar(80) NOT NULL,
	`contactLastName` varchar(80) NOT NULL,
	`contactPhone` varchar(32) NOT NULL,
	`contactEmail` varchar(320) NOT NULL,
	`emergencyName` varchar(160),
	`emergencyPhone` varchar(32),
	`promoCode` varchar(40),
	`usedFreeReschedule` boolean NOT NULL DEFAULT false,
	`holdExpiresAt` datetime,
	`stripeCheckoutSessionId` varchar(128),
	`stripePaymentIntentId` varchar(128),
	`reminder24hSentAt` timestamp,
	`boardingReminderSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookings_bookingNumber_unique` UNIQUE(`bookingNumber`)
);
--> statement-breakpoint
CREATE TABLE `cities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(8) NOT NULL,
	`name` varchar(120) NOT NULL,
	`state` varchar(64) NOT NULL,
	CONSTRAINT `cities_id` PRIMARY KEY(`id`),
	CONSTRAINT `cities_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `departures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`vehicleId` int,
	`driverId` int,
	`departAt` datetime NOT NULL,
	`arriveAt` datetime NOT NULL,
	`capacity` int NOT NULL DEFAULT 10,
	`seatsSold` int NOT NULL DEFAULT 0,
	`seatsHeld` int NOT NULL DEFAULT 0,
	`memberEarlyAccessAt` datetime,
	`status` enum('scheduled','boarding','departed','delayed','arrived','completed','canceled') NOT NULL DEFAULT 'scheduled',
	`delayReason` text,
	`currentLocationLabel` varchar(160),
	`reminder24hSentAt` timestamp,
	`boardingReminderSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `departures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dispatchMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`departureId` int,
	`vehicleId` int,
	`fromUserId` int NOT NULL,
	`kind` enum('dispatch','delay','vehicle_problem') NOT NULL,
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dispatchMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `driverProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`fullName` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(32),
	`licenseNumber` varchar(64),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driverProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `driverProfiles_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cityId` int NOT NULL,
	`label` varchar(160) NOT NULL,
	`address` varchar(255) NOT NULL,
	CONSTRAINT `locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenanceLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`performedAt` datetime NOT NULL,
	`type` varchar(80) NOT NULL,
	`notes` text,
	`mileage` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenanceLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripeSubscriptionId` varchar(128),
	`stripePriceId` varchar(128),
	`status` enum('incomplete','active','past_due','canceled','unpaid') NOT NULL DEFAULT 'incomplete',
	`currentPeriodEnd` datetime,
	`freeReschedulesRemaining` int NOT NULL DEFAULT 1,
	`priceCentsSnapshot` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `memberships_stripeSub_unique` UNIQUE(`stripeSubscriptionId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`channel` enum('in_app','email','sms','push') NOT NULL,
	`templateKey` varchar(64) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`payload` json,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `passengers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bookingId` int NOT NULL,
	`firstName` varchar(80) NOT NULL,
	`lastName` varchar(80) NOT NULL,
	`status` enum('booked','checked_in','boarded','no_show') NOT NULL DEFAULT 'booked',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passengers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bookingId` int,
	`membershipId` int,
	`kind` enum('ticket','membership') NOT NULL,
	`amountCents` int NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'usd',
	`status` enum('pending','succeeded','failed','refunded','canceled') NOT NULL DEFAULT 'pending',
	`stripePaymentIntentId` varchar(128),
	`stripeCheckoutSessionId` varchar(128),
	`receiptUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processedStripeEvents` (
	`eventId` varchar(128) NOT NULL,
	`type` varchar(80) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processedStripeEvents_eventId` PRIMARY KEY(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` int NOT NULL,
	`bookingId` int,
	`amountCents` int NOT NULL,
	`reason` varchar(255),
	`adminUserId` int,
	`stripeRefundId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originCityId` int NOT NULL,
	`destinationCityId` int NOT NULL,
	`pickupLocationId` int NOT NULL,
	`dropoffLocationId` int NOT NULL,
	`estimatedMinutes` int NOT NULL,
	`standardFareCents` int NOT NULL,
	`memberFareCents` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `routes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `savedPassengers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`firstName` varchar(80) NOT NULL,
	`lastName` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `savedPassengers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seedState` (
	`id` int NOT NULL,
	`version` varchar(32) NOT NULL,
	`appliedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seedState_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`settingKey` varchar(64) NOT NULL,
	`valueJson` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_settingKey` PRIMARY KEY(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `supportTickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`subject` varchar(160) NOT NULL,
	`message` text NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supportTickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`passengerId` int NOT NULL,
	`bookingId` int NOT NULL,
	`departureId` int NOT NULL,
	`qrToken` varchar(48) NOT NULL,
	`status` enum('booked','checked_in','boarded','voided') NOT NULL DEFAULT 'booked',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `tickets_qrToken_unique` UNIQUE(`qrToken`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`vin` varchar(32),
	`make` varchar(64) NOT NULL,
	`model` varchar(64) NOT NULL,
	`year` int NOT NULL,
	`capacity` int NOT NULL DEFAULT 10,
	`currentMileage` int NOT NULL DEFAULT 0,
	`registrationExpiresAt` datetime,
	`insuranceExpiresAt` datetime,
	`inspectionExpiresAt` datetime,
	`status` enum('available','assigned','in_transit','maintenance','out_of_service') NOT NULL DEFAULT 'available',
	`assignedDriverId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('customer','driver','admin') NOT NULL DEFAULT 'customer';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `stripeCustomerId` varchar(64);--> statement-breakpoint
CREATE INDEX `auditLogs_entity_idx` ON `auditLogs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `bookings_userId_idx` ON `bookings` (`userId`);--> statement-breakpoint
CREATE INDEX `bookings_outbound_idx` ON `bookings` (`outboundDepartureId`);--> statement-breakpoint
CREATE INDEX `bookings_session_idx` ON `bookings` (`stripeCheckoutSessionId`);--> statement-breakpoint
CREATE INDEX `departures_route_depart_idx` ON `departures` (`routeId`,`departAt`);--> statement-breakpoint
CREATE INDEX `departures_vehicle_idx` ON `departures` (`vehicleId`,`departAt`);--> statement-breakpoint
CREATE INDEX `departures_driver_idx` ON `departures` (`driverId`,`departAt`);--> statement-breakpoint
CREATE INDEX `departures_status_idx` ON `departures` (`status`);--> statement-breakpoint
CREATE INDEX `dispatchMessages_departureId_idx` ON `dispatchMessages` (`departureId`);--> statement-breakpoint
CREATE INDEX `driverProfiles_userId_idx` ON `driverProfiles` (`userId`);--> statement-breakpoint
CREATE INDEX `maintenanceLogs_vehicleId_idx` ON `maintenanceLogs` (`vehicleId`);--> statement-breakpoint
CREATE INDEX `memberships_userId_idx` ON `memberships` (`userId`);--> statement-breakpoint
CREATE INDEX `notifications_userId_idx` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `notifications_template_idx` ON `notifications` (`templateKey`);--> statement-breakpoint
CREATE INDEX `passengers_bookingId_idx` ON `passengers` (`bookingId`);--> statement-breakpoint
CREATE INDEX `payments_userId_idx` ON `payments` (`userId`);--> statement-breakpoint
CREATE INDEX `payments_bookingId_idx` ON `payments` (`bookingId`);--> statement-breakpoint
CREATE INDEX `routes_od_idx` ON `routes` (`originCityId`,`destinationCityId`);--> statement-breakpoint
CREATE INDEX `savedPassengers_userId_idx` ON `savedPassengers` (`userId`);--> statement-breakpoint
CREATE INDEX `supportTickets_userId_idx` ON `supportTickets` (`userId`);--> statement-breakpoint
CREATE INDEX `tickets_bookingId_idx` ON `tickets` (`bookingId`);--> statement-breakpoint
CREATE INDEX `tickets_departureId_idx` ON `tickets` (`departureId`);