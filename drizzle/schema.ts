import {
  boolean,
  datetime,
  index,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["customer", "driver", "admin"]).default("customer").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, table => [uniqueIndex("users_email_unique").on(table.email)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Email/password sign-in is optional alongside Manus OAuth. Never expose hashes
// through the users row or general account-profile responses.
export const memberCredentials = mysqlTable(
  "memberCredentials",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    emailNormalized: varchar("emailNormalized", { length: 320 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    sessionVersion: int("sessionVersion").default(0).notNull(),
    failedAttempts: int("failedAttempts").default(0).notNull(),
    lockedUntil: datetime("lockedUntil", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("memberCredentials_userId_unique").on(table.userId),
    uniqueIndex("memberCredentials_email_unique").on(table.emailNormalized),
  ]
);

// Issued only through the project-owner notification workflow; raw tokens are
// never stored. A token can set a password on an existing admin just once.
export const adminSetupInvites = mysqlTable(
  "adminSetupInvites",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    expiresAt: datetime("expiresAt", { mode: "date" }).notNull(),
    consumedAt: datetime("consumedAt", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("adminSetupInvites_tokenHash_unique").on(table.tokenHash),
    index("adminSetupInvites_userId_idx").on(table.userId),
  ]
);

// Short fixed windows bound admin password-check load across application
// instances, including requests for email addresses that do not exist.
export const adminLoginThrottle = mysqlTable("adminLoginThrottle", {
  rateKey: varchar("rateKey", { length: 64 }).primaryKey(),
  attempts: int("attempts").default(0).notNull(),
  windowEndsAt: datetime("windowEndsAt", { mode: "date" }).notNull(),
}, table => [index("adminLoginThrottle_expiry_idx").on(table.windowEndsAt)]);

// ID image ciphertext is never served through the public storage namespace.
export const memberIdPhotos = mysqlTable("memberIdPhotos", {
  userId: int("userId").primaryKey(),
  ciphertext: longtext("ciphertext").notNull(),
  mimeType: varchar("mimeType", { length: 32 }).notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().onUpdateNow().notNull(),
});

export const driverProfiles = mysqlTable(
  "driverProfiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("driverProfiles_email_unique").on(table.email),
    index("driverProfiles_userId_idx").on(table.userId),
  ]
);

// Driver details are private and never served through public object storage.
export const driverPrivateProfiles = mysqlTable("driverPrivateProfiles", {
  profileId: int("profileId").primaryKey().references(() => driverProfiles.id, { onDelete: "cascade" }),
  idCiphertext: varchar("idCiphertext", { length: 512 }).notNull(),
  idLast4: varchar("idLast4", { length: 4 }).notNull(),
  photoCiphertext: longtext("photoCiphertext").notNull(),
  photoMimeType: varchar("photoMimeType", { length: 32 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const driverSetupInvites = mysqlTable("driverSetupInvites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: datetime("expiresAt", { mode: "date" }).notNull(),
  consumedAt: datetime("consumedAt", { mode: "date" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("driverSetupInvites_tokenHash_unique").on(table.tokenHash),
  index("driverSetupInvites_userId_idx").on(table.userId),
]);

export const vehicles = mysqlTable(
  "vehicles",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 16 }).notNull(),
    vin: varchar("vin", { length: 32 }),
    make: varchar("make", { length: 64 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    year: int("year").notNull(),
    capacity: int("capacity").notNull().default(10),
    currentMileage: int("currentMileage").default(0).notNull(),
  registrationExpiresAt: datetime("registrationExpiresAt", { mode: "date" }),
  insuranceExpiresAt: datetime("insuranceExpiresAt", { mode: "date" }),
  inspectionExpiresAt: datetime("inspectionExpiresAt", { mode: "date" }),
    status: mysqlEnum("status", [
      "available",
      "assigned",
      "in_transit",
      "maintenance",
      "out_of_service",
    ])
      .default("available")
      .notNull(),
    assignedDriverId: int("assignedDriverId"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("vehicles_code_unique").on(table.code)]
);

export const maintenanceLogs = mysqlTable(
  "maintenanceLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    vehicleId: int("vehicleId").notNull(),
    performedAt: datetime("performedAt", { mode: "date" }).notNull(),
    type: varchar("type", { length: 80 }).notNull(),
    notes: text("notes"),
    mileage: int("mileage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("maintenanceLogs_vehicleId_idx").on(table.vehicleId)]
);

export const cities = mysqlTable(
  "cities",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 8 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    state: varchar("state", { length: 64 }).notNull(),
  },
  table => [uniqueIndex("cities_code_unique").on(table.code)]
);

export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  cityId: int("cityId").notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  address: varchar("address", { length: 255 }).notNull(),
});

export const routes = mysqlTable(
  "routes",
  {
    id: int("id").autoincrement().primaryKey(),
    originCityId: int("originCityId").notNull(),
    destinationCityId: int("destinationCityId").notNull(),
    pickupLocationId: int("pickupLocationId").notNull(),
    dropoffLocationId: int("dropoffLocationId").notNull(),
    estimatedMinutes: int("estimatedMinutes").notNull(),
    standardFareCents: int("standardFareCents").notNull(),
    memberFareCents: int("memberFareCents").notNull(),
    frontFareCents: int("frontFareCents").notNull().default(20000),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("routes_od_idx").on(table.originCityId, table.destinationCityId)]
);

export const departures = mysqlTable(
  "departures",
  {
    id: int("id").autoincrement().primaryKey(),
    routeId: int("routeId").notNull(),
    vehicleId: int("vehicleId"),
    driverId: int("driverId"),
    departAt: datetime("departAt", { mode: "date" }).notNull(),
    arriveAt: datetime("arriveAt", { mode: "date" }).notNull(),
    capacity: int("capacity").notNull().default(10),
    seatsSold: int("seatsSold").notNull().default(0),
    seatsHeld: int("seatsHeld").notNull().default(0),
    frontSeatsSold: int("frontSeatsSold").notNull().default(0),
    frontSeatsHeld: int("frontSeatsHeld").notNull().default(0),
    memberEarlyAccessAt: datetime("memberEarlyAccessAt", { mode: "date" }),
    status: mysqlEnum("status", [
      "scheduled",
      "boarding",
      "departed",
      "delayed",
      "arrived",
      "completed",
      "canceled",
    ])
      .default("scheduled")
      .notNull(),
    delayReason: text("delayReason"),
    currentLocationLabel: varchar("currentLocationLabel", { length: 160 }),
    reminder24hSentAt: timestamp("reminder24hSentAt"),
    boardingReminderSentAt: timestamp("boardingReminderSentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("departures_route_depart_idx").on(table.routeId, table.departAt),
    index("departures_vehicle_idx").on(table.vehicleId, table.departAt),
    index("departures_driver_idx").on(table.driverId, table.departAt),
    index("departures_status_idx").on(table.status),
  ]
);

export const bookings = mysqlTable(
  "bookings",
  {
    id: int("id").autoincrement().primaryKey(),
    bookingNumber: varchar("bookingNumber", { length: 24 }).notNull(),
    userId: int("userId"),
    outboundDepartureId: int("outboundDepartureId").notNull(),
    returnDepartureId: int("returnDepartureId"),
    tripType: mysqlEnum("tripType", ["one_way", "round_trip"]).notNull(),
    passengerCount: int("passengerCount").notNull(),
    outboundFrontSeats: int("outboundFrontSeats").notNull().default(0),
    returnFrontSeats: int("returnFrontSeats").notNull().default(0),
    fareType: mysqlEnum("fareType", ["standard", "member"]).notNull(),
    outboundQuotedCents: int("outboundQuotedCents").notNull().default(0),
    returnQuotedCents: int("returnQuotedCents").notNull().default(0),
    amountCents: int("amountCents").notNull(),
    status: mysqlEnum("status", [
      "pending_payment",
      "confirmed",
      "canceled",
      "refunded",
    ])
      .default("pending_payment")
      .notNull(),
    contactFirstName: varchar("contactFirstName", { length: 80 }).notNull(),
    contactLastName: varchar("contactLastName", { length: 80 }).notNull(),
    contactPhone: varchar("contactPhone", { length: 32 }).notNull(),
    contactEmail: varchar("contactEmail", { length: 320 }).notNull(),
    guestAccessHash: varchar("guestAccessHash", { length: 64 }),
    emergencyName: varchar("emergencyName", { length: 160 }),
    emergencyPhone: varchar("emergencyPhone", { length: 32 }),
    promoCode: varchar("promoCode", { length: 40 }),
    usedFreeReschedule: boolean("usedFreeReschedule").default(false).notNull(),
    holdExpiresAt: datetime("holdExpiresAt", { mode: "date" }),
    stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 128 }),
    stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
    reminder24hSentAt: timestamp("reminder24hSentAt"),
    boardingReminderSentAt: timestamp("boardingReminderSentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("bookings_bookingNumber_unique").on(table.bookingNumber),
    index("bookings_userId_idx").on(table.userId),
    index("bookings_outbound_idx").on(table.outboundDepartureId),
    index("bookings_session_idx").on(table.stripeCheckoutSessionId),
  ]
);

export const passengers = mysqlTable(
  "passengers",
  {
    id: int("id").autoincrement().primaryKey(),
    bookingId: int("bookingId").notNull(),
    departureId: int("departureId"),
    seatNumber: varchar("seatNumber", { length: 10 }),
    firstName: varchar("firstName", { length: 80 }).notNull(),
    lastName: varchar("lastName", { length: 80 }).notNull(),
    outboundSeatType: mysqlEnum("outboundSeatType", ["standard", "front"])
      .default("standard")
      .notNull(),
    returnSeatType: mysqlEnum("returnSeatType", ["standard", "front"]),
    status: mysqlEnum("status", ["booked", "checked_in", "boarded", "no_show"])
      .default("booked")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("passengers_bookingId_idx").on(table.bookingId),
    uniqueIndex("passengers_departure_seat_unique").on(table.departureId, table.seatNumber),
  ]
);

export const tickets = mysqlTable(
  "tickets",
  {
    id: int("id").autoincrement().primaryKey(),
    passengerId: int("passengerId").notNull(),
    bookingId: int("bookingId").notNull(),
    departureId: int("departureId").notNull(),
    qrToken: varchar("qrToken", { length: 48 }).notNull(),
    seatType: mysqlEnum("seatType", ["standard", "front"]).default("standard").notNull(),
    status: mysqlEnum("status", ["booked", "checked_in", "boarded", "no_show", "voided"])
      .default("booked")
      .notNull(),
    boardedAt: datetime("boardedAt", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("tickets_qrToken_unique").on(table.qrToken),
    index("tickets_bookingId_idx").on(table.bookingId),
    index("tickets_departureId_idx").on(table.departureId),
  ]
);

export const payments = mysqlTable(
  "payments",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    bookingId: int("bookingId"),
    membershipId: int("membershipId"),
    kind: mysqlEnum("kind", ["ticket", "membership"]).notNull(),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 8 }).default("usd").notNull(),
    status: mysqlEnum("status", ["pending", "succeeded", "failed", "refunded", "canceled"])
      .default("pending")
      .notNull(),
    stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
    stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 128 }),
    receiptUrl: varchar("receiptUrl", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("payments_userId_idx").on(table.userId),
    index("payments_bookingId_idx").on(table.bookingId),
  ]
);

export const refunds = mysqlTable("refunds", {
  id: int("id").autoincrement().primaryKey(),
  paymentId: int("paymentId").notNull(),
  bookingId: int("bookingId"),
  amountCents: int("amountCents").notNull(),
  reason: varchar("reason", { length: 255 }),
  adminUserId: int("adminUserId"),
  stripeRefundId: varchar("stripeRefundId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const memberships = mysqlTable(
  "memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 128 }),
    stripePriceId: varchar("stripePriceId", { length: 128 }),
    status: mysqlEnum("status", ["incomplete", "active", "past_due", "canceled", "unpaid"])
      .default("incomplete")
      .notNull(),
    currentPeriodEnd: datetime("currentPeriodEnd", { mode: "date" }),
    freeReschedulesRemaining: int("freeReschedulesRemaining").default(1).notNull(),
    priceCentsSnapshot: int("priceCentsSnapshot").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("memberships_userId_idx").on(table.userId),
    uniqueIndex("memberships_stripeSub_unique").on(table.stripeSubscriptionId),
  ]
);

export const savedPassengers = mysqlTable(
  "savedPassengers",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    firstName: varchar("firstName", { length: 80 }).notNull(),
    lastName: varchar("lastName", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("savedPassengers_userId_idx").on(table.userId)]
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    channel: mysqlEnum("channel", ["in_app", "email", "sms", "push"]).notNull(),
    templateKey: varchar("templateKey", { length: 64 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    payload: json("payload"),
    sentAt: timestamp("sentAt").defaultNow().notNull(),
    readAt: timestamp("readAt"),
  },
  table => [
    index("notifications_userId_idx").on(table.userId),
    index("notifications_template_idx").on(table.templateKey),
  ]
);

export const supportTickets = mysqlTable(
  "supportTickets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    subject: varchar("subject", { length: 160 }).notNull(),
    message: text("message").notNull(),
    status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("supportTickets_userId_idx").on(table.userId)]
);

export const dispatchMessages = mysqlTable(
  "dispatchMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    departureId: int("departureId"),
    vehicleId: int("vehicleId"),
    fromUserId: int("fromUserId").notNull(),
    kind: mysqlEnum("kind", ["dispatch", "delay", "vehicle_problem"]).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("dispatchMessages_departureId_idx").on(table.departureId)]
);

export const auditLogs = mysqlTable(
  "auditLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId"),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 40 }).notNull(),
    entityId: varchar("entityId", { length: 40 }).notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("auditLogs_entity_idx").on(table.entityType, table.entityId)]
);

export const settings = mysqlTable("settings", {
  settingKey: varchar("settingKey", { length: 64 }).primaryKey(),
  valueJson: json("valueJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const processedStripeEvents = mysqlTable("processedStripeEvents", {
  eventId: varchar("eventId", { length: 128 }).primaryKey(),
  type: varchar("type", { length: 80 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
});

export const seedState = mysqlTable("seedState", {
  id: int("id").primaryKey(),
  version: varchar("version", { length: 32 }).notNull(),
  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
});
