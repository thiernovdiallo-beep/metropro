ALTER TABLE `bookings` ADD `outboundFrontSeats` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `returnFrontSeats` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `departures` ADD `frontSeatsSold` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `departures` ADD `frontSeatsHeld` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `passengers` ADD `outboundSeatType` enum('standard','front') DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `passengers` ADD `returnSeatType` enum('standard','front');--> statement-breakpoint
ALTER TABLE `routes` ADD `frontFareCents` int DEFAULT 20000 NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `seatType` enum('standard','front') DEFAULT 'standard' NOT NULL;