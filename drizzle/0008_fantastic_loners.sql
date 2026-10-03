CREATE TABLE `adminLoginThrottle` (
	`rateKey` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`windowEndsAt` datetime NOT NULL,
	CONSTRAINT `adminLoginThrottle_rateKey` PRIMARY KEY(`rateKey`)
);
