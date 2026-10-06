ALTER TABLE `passengers` ADD `departureId` int;--> statement-breakpoint
ALTER TABLE `passengers` ADD `seatNumber` varchar(10);--> statement-breakpoint
ALTER TABLE `passengers` ADD CONSTRAINT `passengers_departure_seat_unique` UNIQUE(`departureId`,`seatNumber`);