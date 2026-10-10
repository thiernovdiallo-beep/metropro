ALTER TABLE `passengers`
  ADD COLUMN `outboundPickupLocationId` int NULL,
  ADD COLUMN `outboundDropoffLocationId` int NULL,
  ADD COLUMN `returnPickupLocationId` int NULL,
  ADD COLUMN `returnDropoffLocationId` int NULL;
