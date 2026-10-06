type Itinerary = {
  originCityId: number; destinationCityId: number;
  pickupLocationId: number; dropoffLocationId: number; estimatedMinutes: number;
};

export function changesBookedItinerary(existing: Itinerary, next: Itinerary): boolean {
  return existing.originCityId !== next.originCityId || existing.destinationCityId !== next.destinationCityId ||
    existing.pickupLocationId !== next.pickupLocationId || existing.dropoffLocationId !== next.dropoffLocationId ||
    existing.estimatedMinutes !== next.estimatedMinutes;
}
