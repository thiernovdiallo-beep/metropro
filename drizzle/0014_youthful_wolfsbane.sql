ALTER TABLE `refunds` ADD `status` enum('pending','succeeded','failed') DEFAULT 'succeeded' NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `failureReason` varchar(255);--> statement-breakpoint
ALTER TABLE `refunds` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_stripeRefundId_unique` UNIQUE(`stripeRefundId`);