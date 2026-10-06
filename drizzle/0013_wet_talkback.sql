ALTER TABLE `passengers` ADD `returnDepartureId` int;--> statement-breakpoint
ALTER TABLE `passengers` ADD `returnSeatNumber` varchar(10);--> statement-breakpoint
ALTER TABLE `passengers` ADD CONSTRAINT `passengers_return_departure_seat_unique` UNIQUE(`returnDepartureId`,`returnSeatNumber`);