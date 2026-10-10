import { eq } from "drizzle-orm";
import {
  cities,
  departures,
  driverProfiles,
  locations,
  routeStops,
  routes,
  seedState,
  settings,
  vehicles,
} from "../drizzle/schema";
import { getDb } from "./db";
import { DEFAULT_SETTINGS } from "./services/policies";

const SEED_VERSION = "metropro-v3-mock-stops";

function atLocalHour(day: Date, hour: number, minute = 0) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function ensureSeed() {
  const db = await getDb();
  if (!db) return;

  const existing = await db.select().from(seedState).where(eq(seedState.id, 1)).limit(1);
  if (existing[0]?.version === SEED_VERSION) return;

  const cityCount = await db.select({ id: cities.id }).from(cities).limit(1);
  if (cityCount.length === 0) {
    await db.insert(cities).values([
      { code: "NYC", name: "New York City", state: "NY", latitude: 40.7128, longitude: -74.006 },
      { code: "CMH", name: "Columbus", state: "OH", latitude: 39.9612, longitude: -82.9988 },
      { code: "CLE", name: "Cleveland", state: "OH" },
      { code: "PIT", name: "Pittsburgh", state: "PA" },
      { code: "CVG", name: "Cincinnati", state: "OH" },
    ]);
  }

  const allCities = await db.select().from(cities);
  const nyc = allCities.find(c => c.code === "NYC");
  const cmh = allCities.find(c => c.code === "CMH");
  if (!nyc || !cmh) return;
  await Promise.all([
    db.update(cities).set({ latitude: 40.7128, longitude: -74.006 }).where(eq(cities.id, nyc.id)),
    db.update(cities).set({ latitude: 39.9612, longitude: -82.9988 }).where(eq(cities.id, cmh.id)),
  ]);

  const locCount = await db.select({ id: locations.id }).from(locations).limit(1);
  if (locCount.length === 0) {
    await db.insert(locations).values([
      {
        cityId: nyc.id,
        label: "Port Authority Bus Terminal",
        address: "625 8th Ave, New York, NY 10018",
        latitude: 40.7569,
        longitude: -73.9903,
        placeId: null,
      },
      {
        cityId: cmh.id,
        label: "Columbus Convention Center",
        address: "400 N High St, Columbus, OH 43215",
        latitude: 39.969,
        longitude: -83.0088,
        placeId: null,
      },
    ]);
  }

  const allLocs = await db.select().from(locations);
  const nycPickup = allLocs.find(l => l.cityId === nyc.id);
  const cmhPickup = allLocs.find(l => l.cityId === cmh.id);
  if (!nycPickup || !cmhPickup) return;
  await Promise.all([
    db.update(locations).set({ latitude: 40.7569, longitude: -73.9903 }).where(eq(locations.id, nycPickup.id)),
    db.update(locations).set({ latitude: 39.969, longitude: -83.0088 }).where(eq(locations.id, cmhPickup.id)),
  ]);

  const mockCitySpecs = [
    { code: "PHL", name: "Philadelphia", state: "PA", latitude: 39.9526, longitude: -75.1652 },
    { code: "HAR", name: "Harrisburg", state: "PA", latitude: 40.2732, longitude: -76.8867 },
  ];
  for (const spec of mockCitySpecs) {
    const existingCity = await db.select({ id: cities.id }).from(cities).where(eq(cities.code, spec.code)).limit(1);
    if (!existingCity.length) await db.insert(cities).values(spec);
  }
  const refreshedCities = await db.select().from(cities);
  const philadelphia = refreshedCities.find(city => city.code === "PHL");
  const harrisburg = refreshedCities.find(city => city.code === "HAR");
  if (!philadelphia || !harrisburg) return;

  const mockStopSpecs = [
    {
      cityId: philadelphia.id,
      label: "Mock Stop · Philadelphia Bus Terminal",
      address: "1001 Filbert St, Philadelphia, PA 19107",
      latitude: 39.9557,
      longitude: -75.1580,
    },
    {
      cityId: harrisburg.id,
      label: "Mock Stop · Harrisburg Transportation Center",
      address: "4th & Chestnut St, Harrisburg, PA 17101",
      latitude: 40.2644,
      longitude: -76.8700,
    },
  ];
  // Keep the mock records idempotent and visibly labeled so they can be removed later.
  for (const spec of mockStopSpecs) {
    const existingStop = await db.select({ id: locations.id }).from(locations).where(eq(locations.label, spec.label)).limit(1);
    if (!existingStop.length) {
      await db.insert(locations).values({ ...spec, placeId: null });
    }
  }
  const refreshedLocations = await db.select().from(locations);
  const philadelphiaStop = refreshedLocations.find(location => location.label === mockStopSpecs[0].label);
  const harrisburgStop = refreshedLocations.find(location => location.label === mockStopSpecs[1].label);

  const routeCount = await db.select({ id: routes.id }).from(routes).limit(1);
  if (routeCount.length === 0) {
    await db.insert(routes).values([
      {
        originCityId: nyc.id,
        destinationCityId: cmh.id,
        pickupLocationId: nycPickup.id,
        dropoffLocationId: cmhPickup.id,
        estimatedMinutes: 540,
        standardFareCents: 15000,
        memberFareCents: 10000,
        frontFareCents: 20000,
        isActive: true,
      },
      {
        originCityId: cmh.id,
        destinationCityId: nyc.id,
        pickupLocationId: cmhPickup.id,
        dropoffLocationId: nycPickup.id,
        estimatedMinutes: 540,
        standardFareCents: 15000,
        memberFareCents: 10000,
        frontFareCents: 20000,
        isActive: true,
      },
    ]);
  }

  const allRoutesForStops = await db.select().from(routes);
  const nycToColumbus = allRoutesForStops.find(route => route.originCityId === nyc.id && route.destinationCityId === cmh.id);
  const columbusToNyc = allRoutesForStops.find(route => route.originCityId === cmh.id && route.destinationCityId === nyc.id);
  if (philadelphiaStop && harrisburgStop) {
    for (const [route, orderedStops] of [
      [nycToColumbus, [philadelphiaStop, harrisburgStop]],
      [columbusToNyc, [harrisburgStop, philadelphiaStop]],
    ] as const) {
      if (!route) continue;
      const existingStops = await db.select({ id: routeStops.id }).from(routeStops).where(eq(routeStops.routeId, route.id)).limit(1);
      if (!existingStops.length) {
        await db.insert(routeStops).values(orderedStops.map((location, index) => ({
          routeId: route.id,
          locationId: location.id,
          stopOrder: index + 1,
          pickupAllowed: true,
          dropoffAllowed: true,
        })));
      }
    }
  }

  const driverCount = await db.select({ id: driverProfiles.id }).from(driverProfiles).limit(1);
  if (driverCount.length === 0) {
    await db.insert(driverProfiles).values([
      {
        fullName: "Jordan Hale",
        email: "jordan.hale@metropro.example",
        phone: "212-555-0101",
        status: "active",
      },
      {
        fullName: "Priya Patel",
        email: "priya.patel@metropro.example",
        phone: "614-555-0102",
        status: "active",
      },
      {
        fullName: "Marcus Chen",
        email: "marcus.chen@metropro.example",
        phone: "212-555-0103",
        status: "active",
      },
      {
        fullName: "Alicia Romero",
        email: "alicia.romero@metropro.example",
        phone: "614-555-0104",
        status: "active",
      },
    ]);
  }

  const vehicleCount = await db.select({ id: vehicles.id }).from(vehicles).limit(1);
  if (vehicleCount.length === 0) {
    const year = new Date().getFullYear() - 1;
    const ins = addHours(new Date(), 24 * 280);
    await db.insert(vehicles).values([
      {
        code: "MP-001",
        vin: "1FDFE4FS0MDC00001",
        make: "Ford",
        model: "Transit 350",
        year,
        capacity: 11,
        currentMileage: 41200,
        registrationExpiresAt: ins,
        insuranceExpiresAt: ins,
        inspectionExpiresAt: ins,
        status: "available",
      },
      {
        code: "MP-002",
        vin: "1FDFE4FS0MDC00002",
        make: "Ford",
        model: "Transit 350",
        year,
        capacity: 11,
        currentMileage: 38840,
        registrationExpiresAt: ins,
        insuranceExpiresAt: ins,
        inspectionExpiresAt: ins,
        status: "available",
      },
      {
        code: "MP-003",
        vin: "1FDFE4FS0MDC00003",
        make: "Mercedes-Benz",
        model: "Sprinter",
        year,
        capacity: 11,
        currentMileage: 22110,
        registrationExpiresAt: ins,
        insuranceExpiresAt: ins,
        inspectionExpiresAt: ins,
        status: "available",
      },
      {
        code: "MP-004",
        vin: "1FDFE4FS0MDC00004",
        make: "Mercedes-Benz",
        model: "Sprinter",
        year,
        capacity: 11,
        currentMileage: 19870,
        registrationExpiresAt: ins,
        insuranceExpiresAt: ins,
        inspectionExpiresAt: ins,
        status: "available",
      },
    ]);
  }

  const settingRow = await db.select().from(settings).limit(1);
  if (settingRow.length === 0) {
    await db.insert(settings).values({ settingKey: "app", valueJson: DEFAULT_SETTINGS });
  }

  const depCount = await db.select({ id: departures.id }).from(departures).limit(1);
  if (depCount.length === 0) {
    const allRoutes = await db.select().from(routes);
    const allVehicles = await db.select().from(vehicles);
    const allDrivers = await db.select().from(driverProfiles);
    const nycCmh = allRoutes.find(r => r.originCityId === nyc.id);
    const cmhNyc = allRoutes.find(r => r.originCityId === cmh.id);
    if (nycCmh && cmhNyc && allVehicles.length >= 4 && allDrivers.length >= 4) {
      const rows: Array<typeof departures.$inferInsert> = [];
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      for (let i = 0; i < 21; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        const slots = [
          { hour: 8, route: nycCmh, vehicle: allVehicles[0], driver: allDrivers[0] },
          { hour: 8, route: cmhNyc, vehicle: allVehicles[1], driver: allDrivers[1] },
          { hour: 14, route: nycCmh, vehicle: allVehicles[2], driver: allDrivers[2] },
          { hour: 14, route: cmhNyc, vehicle: allVehicles[3], driver: allDrivers[3] },
        ];
        for (const slot of slots) {
          const departAt = atLocalHour(day, slot.hour);
          const arriveAt = addHours(departAt, 9);
          rows.push({
            routeId: slot.route.id,
            vehicleId: slot.vehicle.id,
            driverId: slot.driver.id,
            departAt,
            arriveAt,
            capacity: slot.vehicle.capacity,
            seatsSold: 0,
            seatsHeld: 0,
            status: "scheduled",
            currentLocationLabel:
              slot.route.originCityId === nyc.id ? "New York City" : "Columbus",
          });
        }
      }
      const chunk = 40;
      for (let i = 0; i < rows.length; i += chunk) {
        await db.insert(departures).values(rows.slice(i, i + chunk));
      }
    }
  }

  await db
    .insert(seedState)
    .values({ id: 1, version: SEED_VERSION, appliedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { version: SEED_VERSION, appliedAt: new Date() } });
}
