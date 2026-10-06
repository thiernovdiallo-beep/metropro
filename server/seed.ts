import { eq } from "drizzle-orm";
import {
  cities,
  departures,
  driverProfiles,
  locations,
  routes,
  seedState,
  settings,
  vehicles,
} from "../drizzle/schema";
import { getDb } from "./db";
import { DEFAULT_SETTINGS } from "./services/policies";

const SEED_VERSION = "metropro-v1";

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
      { code: "NYC", name: "New York City", state: "NY" },
      { code: "CMH", name: "Columbus", state: "OH" },
      { code: "CLE", name: "Cleveland", state: "OH" },
      { code: "PIT", name: "Pittsburgh", state: "PA" },
      { code: "CVG", name: "Cincinnati", state: "OH" },
    ]);
  }

  const allCities = await db.select().from(cities);
  const nyc = allCities.find(c => c.code === "NYC");
  const cmh = allCities.find(c => c.code === "CMH");
  if (!nyc || !cmh) return;

  const locCount = await db.select({ id: locations.id }).from(locations).limit(1);
  if (locCount.length === 0) {
    await db.insert(locations).values([
      {
        cityId: nyc.id,
        label: "Port Authority Bus Terminal",
        address: "625 8th Ave, New York, NY 10018",
      },
      {
        cityId: cmh.id,
        label: "Columbus Convention Center",
        address: "400 N High St, Columbus, OH 43215",
      },
    ]);
  }

  const allLocs = await db.select().from(locations);
  const nycPickup = allLocs.find(l => l.cityId === nyc.id);
  const cmhPickup = allLocs.find(l => l.cityId === cmh.id);
  if (!nycPickup || !cmhPickup) return;

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
