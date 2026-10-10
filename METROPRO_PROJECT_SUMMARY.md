# MetroPro Complete Project Summary

**Report date:** 2026-10-10  
**Repository:** `https://github.com/thiernovdiallo-beep/metropro.git`  
**Current branch:** `main`  
**Latest committed checkpoint:** `7c763d046af52d72e2d5ffea37818ee97c564878` — `Match van seat map to reference chair diagram`  
**Important repository state:** The worktree is currently **not clean**. The latest commit is the last committed checkpoint, but many follow-up changes from later sessions remain modified or untracked locally and are not represented by that commit.

---

## 1. Executive status

MetroPro is a React/Express/tRPC/Drizzle/MySQL mobile-first interstate passenger-van booking platform for scheduled New York City ↔ Columbus, Ohio service. The implemented product now covers:

- Guest and member booking
- Member profiles, ID-photo handling, membership billing architecture
- Route/departure search
- Numbered seat selection for an 11-paying-passenger configuration plus driver
- Stripe checkout, webhook fulfillment, refunds and payment safeguards
- Digital tickets with QR codes and physical seat numbers
- Customer account, booking lookup, cancellation and rescheduling flows
- Admin operations, fleet, schedules, routes, analytics, payments and support
- Driver authentication, trip manifests, QR boarding and operational support
- Google Maps route visualization with origin, intermediate stops and destination markers
- Customer password reset
- Separate customer, admin and driver layouts

The current source tree also contains an in-progress route-stop and portal/layout consolidation pass that has not yet been committed.

---

# 2. Customer-facing features

## 2.1 Homepage and public information

### Homepage

**File:** `client/src/pages/Home.tsx`

Implemented:

- Direct booking-first landing page rather than an introductory splash page.
- Origin, destination, one-way/round-trip, departure date, return date and passenger-count search.
- Route and city data loaded from public tRPC queries.
- Swap-origin/destination action.
- Member sign-in form on the landing page.
- Guest booking lookup using booking reference and private access code.
- Links for account creation, password recovery and booking retrieval.
- Hero travel image and destination/route marketing sections.
- Homepage sections for popular routes, how MetroPro works, travel information, ticket explanation, FAQs, destination content and final booking CTA.
- No requirement for customers to sign in before booking.

### Public information pages

**Current route registrations:** `client/src/App.tsx:58-81`

Added public pages/components through `client/src/pages/PublicInfo.tsx` and related lazy routes:

- `/about`
- `/routes`
- `/schedules`
- `/contact`
- `/faq`
- `/travel-information`
- `/terms`
- `/privacy`

These pages are connected to the public customer layout and navigation.

## 2.2 Booking workflow

### Search and departure selection

**File:** `client/src/pages/SearchResults.tsx`

Implemented:

- Search results for NYC ↔ Columbus routes.
- One-way and round-trip departure selection.
- Departure time, arrival estimate, fare, member fare, pickup/drop-off details and seat availability.
- Route map above the result cards.
- Ordered route summary and intermediate-stop legend.
- Route map markers for origin, intermediate stops and destination.
- Map display is responsive and includes a static server-side fallback when the browser Maps loader cannot initialize.

### Trip details and seat selection

**Files:**

- `client/src/pages/TripDetails.tsx`
- `client/src/pages/SeatSelection.tsx`
- `client/src/components/SeatMap.tsx`
- `shared/seat-layout.ts`
- `client/src/lib/seatLayout.ts`
- `server/services/seat-layout.ts`

Implemented:

- Separate trip-detail and seat-selection steps.
- Interactive numbered seat map.
- Current operating layout: **11 paying passenger seats plus one driver position**.
- Reference-style open chair diagram.
- Middle 3M seat treatment.
- Front passenger seat treatment.
- Driver/steering-wheel area is non-bookable.
- Seat states: available, held, taken, selected and blocked/disabled.
- Seat labels, prices, passenger-to-seat assignment list and hold countdown.
- Keyboard/ARIA support and mobile-responsive rendering.
- Seat map tests and 11-seat layout tests.

### Passenger information and stop selection

**File:** `client/src/pages/PassengerInfo.tsx`

Implemented:

- Passenger name, contact and emergency-contact collection.
- Member traveler selection and member-fare handling.
- Per-passenger numbered seat assignment.
- Outbound and return seat assignments for round trips.
- Per-passenger pickup and drop-off selection from the ordered route stops.
- Validation that selected stops are permitted for pickup/drop-off.
- Session-storage handoff of selected seats and stop locations to checkout.
- Existing member-discount and traveler logic retained.

### Checkout and confirmation

**Files:**

- `client/src/pages/Checkout.tsx`
- `client/src/pages/Confirmation.tsx`
- `server/routers/booking.ts`

Implemented:

- Quote/review page.
- Passenger-specific seat display.
- Passenger-specific pickup/drop-off display.
- Stripe Checkout redirect.
- Guest and member booking access behavior.
- Checkout error handling.
- Confirmation page and ticket retrieval.

A live end-to-end stop-selection test reached checkout, selected Philadelphia as a pickup stop and Columbus as the drop-off, and exposed a review serialization issue. The quote/review path was then updated so selected stops are preserved and displayed.

### Digital tickets

**Files:**

- `client/src/pages/Ticket.tsx`
- `server/services/tickets.ts`
- `server/services/ticket-seat.ts`
- `server/routers/account.ts`

Implemented:

- MetroPro digital ticket display.
- Booking number, passenger, route, departure, pickup/drop-off, seat number and status.
- QR code generation and display.
- Passenger-specific selected-stop display.
- Physical seat labels such as `Seat 2A`.
- Account and confirmation ticket retrieval.

## 2.3 Customer account and membership

### Customer account

**File:** `client/src/pages/Account.tsx`

Implemented:

- Account overview.
- Upcoming and previous trips.
- Digital-ticket links.
- Membership status.
- Saved passengers/profile sections.
- Payment and receipt sections.
- Notifications.
- Customer support destination.
- Profile settings.
- ID-photo upload flow.
- Upcoming-trip cancellation and reschedule actions.

### Customer support

**Files:**

- `client/src/pages/CustomerSupport.tsx`
- `server/routers/account.ts`
- `drizzle/schema.ts` (`supportTickets`)

Implemented:

- Customer support form.
- Customer-owned ticket history query.
- Separate `/support` route.
- Customer support links standardized from legacy account-support URLs.

### Membership

**Files:**

- `client/src/pages/Membership.tsx`
- `client/src/pages/CreateAccount.tsx`
- `server/routers/member-auth.ts`
- `server/services/member-auth.ts`
- `server/services/member-profile.ts`
- `server/stripe/webhook.ts`

Implemented:

- Member account creation.
- Required name, email, phone and ID photo for member profiles.
- Recurring membership architecture.
- Member pricing eligibility.
- Member-only fare handling.
- Membership status and billing history.
- Clarified that companions do not automatically receive the member fare.
- Front passenger-seat pricing remains separate from member eligibility.

The project history contains earlier pricing iterations, including $125/$150, $100/$150 and $25/$29.99 membership discussions. The current source configuration should be treated as authoritative; earlier business-plan figures are historical design decisions, not all simultaneous runtime rules.

### Customer password reset

**Files:**

- `client/src/pages/ForgotPassword.tsx`
- `client/src/pages/ResetPassword.tsx`
- `server/routers/member-auth.ts`
- `server/services/password-reset.ts`
- `server/services/password-reset.test.ts`
- `server/services/notifications.ts`
- `drizzle/0018_password_reset_tokens.sql`

Implemented and verified:

- `/forgot-password` request page.
- `/reset-password` page.
- Token read from the URL fragment: `#token=...`, not the query string.
- Token hashes stored, raw tokens not stored.
- Twenty-four-hour expiry.
- One-time token consumption.
- Password-strength validation.
- Session-version invalidation after password change.
- Generic success response whether or not the email exists, preventing account enumeration.
- Rate limiting for reset requests.
- Notification delivery currently uses the existing notification placeholder and still needs production email delivery.

## 2.4 Customer rescheduling

**Files:**

- `client/src/pages/RescheduleBooking.tsx`
- `client/src/pages/Account.tsx`
- `server/routers/account.ts`
- `server/services/rescheduling.ts`
- `server/services/policies.ts`
- `client/src/App.tsx:78`

Implemented:

- Customer reschedule button for eligible paid upcoming trips.
- Cutoff-aware disabled state and explanation.
- Alternative-departure selection on the same route.
- Reschedule policy and fee display.
- Customer confirmation and error handling.
- Admin and customer reschedule reuse in one page with role-specific shells.

---

# 3. Admin features

## 3.1 Admin authentication and access

**Files:**

- `client/src/pages/AdminLogin.tsx`
- `client/src/pages/AdminSetup.tsx`
- `client/src/components/AdminGuard.tsx`
- `server/routers/admin-auth.ts`
- `server/services/admin-auth.ts`
- `server/services/admin-throttle.ts`
- `scripts/send-admin-setup.ts`
- `scripts/send-admin-reset.ts`

Implemented:

- Discreet admin sign-in entry at the bottom of the customer site.
- Admin password sign-in for Preview.
- Owner-approved one-time setup/reset links.
- Admin password hashing and validation.
- Admin login throttling.
- Admin session invalidation/promotion behavior.
- Multiple administrator support.
- Existing Google/Apple/Manus authentication architecture retained separately from password authentication.

A mobile setup-link issue was diagnosed as a Preview-origin/path problem. The setup page itself rendered, and the origin-validation and link handling were investigated and corrected during the prior sessions. Credentials and reset tokens are intentionally not included in this report.

## 3.2 Admin dashboard and operations

**Files:**

- `client/src/pages/AdminHome.tsx`
- `client/src/pages/AdminOperations.tsx`
- `client/src/pages/AdminPages.tsx`
- `client/src/pages/AdminSchedule.tsx`
- `client/src/components/AnalyticsDashboard.tsx`
- `client/src/components/DispatchAssignment.tsx`
- `client/src/components/RouteCreateForm.tsx`
- `server/services/admin-operations.ts`
- `server/services/analytics.ts`
- `server/services/dispatch.ts`

Implemented:

- Operational dashboard.
- Booking search and booking detail.
- Payment and refund views.
- Trip detail and dispatch views.
- Schedule management using Eastern Time business rules.
- Fleet and vehicle management.
- Driver assignment.
- Route creation and editing.
- Vehicle-overlap and driver-overlap safety checks.
- Revenue, occupancy, membership and operational analytics.
- Admin settings.
- Rescheduling tools.

## 3.3 Admin support inbox

**Files:**

- `client/src/pages/AdminSupport.tsx`
- `server/routers/admin.ts:144-181`
- `server/services/admin-operations.ts`
- `client/src/App.tsx:94`

Implemented:

- `/admin/support` route protected by `AdminGuard`.
- Newest-first support ticket list.
- Customer name, email, subject, message, status and creation date.
- Ticket detail view.
- All/Open/Closed filters.
- Open/closed status mutation.
- Responsive mobile presentation.
- Empty state: `No support tickets yet`.

## 3.4 Admin route-stop management

**Files:**

- `client/src/components/RouteStopsEditor.tsx`
- `client/src/pages/AdminPages.tsx`
- `server/routers/admin.ts:578-618`
- `drizzle/schema.ts:235-252`
- `drizzle/0019_route_stops.sql`

Implemented/in progress in the current worktree:

- Ordered route stops.
- Stop location selection.
- Stop order editing.
- Pickup/drop-off permission flags.
- Add/update/delete route-stop operations.
- Admin route editor integration.

The route-stop migration and source changes are currently uncommitted.

---

# 4. Driver features

## 4.1 Driver authentication and profiles

**Files:**

- `client/src/pages/DriverLogin.tsx`
- `client/src/pages/DriverSetup.tsx`
- `client/src/components/DriverGuard.tsx`
- `client/src/components/DriverAccountForm.tsx`
- `client/src/components/DriverPortrait.tsx`
- `client/src/lib/usePrivateDriverPhoto.ts`
- `server/routers/driver-auth.ts`
- `server/services/driver-auth.ts`
- `server/services/driver-private.ts`

Implemented:

- Separate driver login.
- Admin-provisioned driver accounts.
- One-time driver setup flow.
- Driver phone, ID and photo handling.
- Private driver-photo handling.
- Driver-only route guard.
- Driver role authorization tests.

## 4.2 Driver operations

**Files:**

- `client/src/pages/DriverHome.tsx`
- `client/src/pages/DriverTrip.tsx`
- `client/src/pages/DriverSupport.tsx`
- `server/routers/driver.ts`
- `server/services/dispatch.ts`

Implemented:

- Today's trip dashboard.
- Upcoming assignments.
- Assigned vehicle and route.
- Passenger manifest.
- Passenger-specific pickup/drop-off locations.
- Ordered intermediate-stop sequence.
- QR ticket scanning.
- Manual check-in.
- Boarding/no-show handling.
- Trip status operations.
- Delay and vehicle-problem support path.
- Dedicated `/driver/support` route.
- Driver support form separated from customer support.

---

# 5. Backend changes

## 5.1 Authentication and authorization

**Core files:**

- `server/_core/sdk.ts`
- `server/_core/trpc.ts`
- `server/_core/oauth.ts`
- `server/_core/cookies.ts`
- `server/routers.ts`
- `server/routers/admin-auth.ts`
- `server/routers/member-auth.ts`
- `server/routers/driver-auth.ts`
- `server/routers/admin.ts`
- `server/routers/driver.ts`
- `server/routers/account.ts`

Implemented:

- Customer/member, admin and driver roles.
- Protected tRPC procedures.
- Admin and driver guards on backend procedures.
- Role-specific session storage keys on the client.
- Session invalidation after password resets.
- Guest access-token protection for account-free bookings.
- Admin and driver throttling.

## 5.2 Booking, pricing and inventory

**Core files:**

- `server/routers/booking.ts`
- `server/services/inventory.ts`
- `server/services/seat-inventory.ts`
- `server/services/seat-selection.ts`
- `server/services/pricing.ts`
- `server/services/fulfillment.ts`
- `server/services/hold-reconciliation.ts`
- `server/services/refund-lifecycle.ts`
- `server/services/policies.ts`
- `server/services/rescheduling.ts`

Implemented:

- Quantity-based inventory retained for backward compatibility.
- Individual numbered-seat availability added in parallel.
- Race-resistant seat-hold behavior preserved.
- Pending-payment holds and expiry handling.
- Paid/taken, held and available seat states.
- Seat-layout validation.
- Member and front-seat pricing rules.
- Round-trip booking and reverse-route validation.
- Durable fulfillment after Stripe payment.
- Refund intent saga and reconciliation.
- Rescheduling with numbered-seat handling.
- Cleanup of selected seats/stops on expiry, payment failure, cancellation and refund.

## 5.3 Stripe and payments

**Files:**

- `server/stripe/client.ts`
- `server/stripe/products.ts`
- `server/stripe/webhook.ts`
- `server/routers/booking.ts`
- `server/services/fulfillment.ts`
- `server/services/refund-lifecycle.ts`
- `client/src/lib/stripeReceipt.ts`

Implemented:

- Stripe Checkout session creation.
- Grouped line items by price and description.
- Seat number metadata.
- Booking fulfillment from webhook metadata.
- Membership subscriptions.
- Payment records.
- Refund lifecycle and reconciliation.
- Stripe webhook signature verification.
- Duplicate-event protection via processed Stripe events.

A Stripe diagnosis was run after a reported checkout error. The configuration, client key, Checkout construction, webhook registration, account state and safe test requests were inspected. The project also attempted to connect the Stripe integration for live-payment setup. The user-supplied Stripe payment link was not used as a credential or payment method. The final live-payment readiness still depends on the connected Stripe account/configuration and webhook environment.

## 5.4 Notifications and reminders

**Files:**

- `server/services/notifications.ts`
- `server/services/reminders.ts`
- `server/_core/notification.ts`

Implemented/fixed:

- Notification templates for booking confirmation, departure reminders, boarding, password reset and operational messages.
- Durable reminder deduplication for outbound and return legs.
- Departure-level reminder timestamps used as guards.
- Password-reset notification placeholder.

Known limitation: `notify()` currently persists notification rows but is not yet a complete customer-facing email/SMS delivery system. SendGrid connection setup was initiated, but production delivery still needs final connector configuration and wiring.

## 5.5 Google Maps and route visualization

**Files:**

- `client/src/components/Map.tsx`
- `server/_core/map.ts`
- `server/_core/index.ts`
- `server/routers/public.ts`
- `client/src/pages/SearchResults.tsx`
- `drizzle/schema.ts`
- `server/seed.ts`
- `drizzle/0017_fluffy_post.sql`

Implemented:

- Latitude/longitude fields on cities and locations.
- Optional location `placeId`.
- Seeded NYC, Columbus and route-location coordinates.
- Browser Maps loader integration through the existing Manus proxy.
- Marker support for origin, intermediate stops and destination.
- Auto-fit bounds and mobile zoom adjustment.
- Marker labels and stop tooltips/focus labels.
- Static map fallback through a server-side proxy endpoint.
- Route geometry/route-tape visualization.
- Public route/search responses include coordinate and stop data.

Audit finding: the browser Maps proxy initially returned HTTP 403 because the browser-key origin authorization did not match the Preview origin. A static server-side map fallback was added so SearchResults could still render the route while connector authorization was investigated. The Google Maps connector was refreshed/enabled during the investigation.

---

# 6. Database changes

## 6.1 Current schema areas

**File:** `drizzle/schema.ts`

Current schema includes:

- `users`
- `memberCredentials`
- `passwordResetTokens`
- `adminSetupInvites`
- `adminLoginThrottle`
- `memberIdPhotos`
- `driverProfiles`
- `driverPrivateProfiles`
- `driverSetupInvites`
- `vehicles`
- `maintenanceLogs`
- `cities`
- `locations`
- `routes`
- `routeStops`
- `departures`
- `bookings`
- `passengers`
- `tickets`
- `payments`
- `refunds`
- `memberships`
- `savedPassengers`
- `notifications`
- `supportTickets`
- `dispatchMessages`
- `auditLogs`
- `settings`
- `processedStripeEvents`
- `seedState`

Important current line references:

- `passwordResetTokens`: `drizzle/schema.ts:57-73`
- `cities`: `drizzle/schema.ts:193-204`
- `locations`: `drizzle/schema.ts:206-214`
- `routes`: `drizzle/schema.ts:216-233`
- `routeStops`: `drizzle/schema.ts:235-252`
- `departures`: `drizzle/schema.ts:254-293`
- `bookings`: `drizzle/schema.ts:295-342`
- `passengers`: `drizzle/schema.ts:344-373`
- `supportTickets`: `drizzle/schema.ts:489-500`
- `settings`: `drizzle/schema.ts:530-534`

## 6.2 Additive migrations

New migrations were created without editing the original migration SQL files:

- `drizzle/0012_aromatic_ken_ellis.sql` — nullable per-departure seat assignment columns/indexes.
- `drizzle/0013_wet_talkback.sql` — numbered-seat reservation/seat fields.
- `drizzle/0014_youthful_wolfsbane.sql` — operations/payment/rescheduling support schema.
- `drizzle/0015_plain_chronomancer.sql` — multiple-admin/session promotion support.
- `drizzle/0016_chubby_pete_wisdom.sql` — 11-passenger capacity/vehicle layout changes.
- `drizzle/0017_fluffy_post.sql` — city/location latitude, longitude and place ID.
- `drizzle/0018_password_reset_tokens.sql` — password reset token table.
- `drizzle/0019_route_stops.sql` — ordered route-stop table.
- `drizzle/0020_passenger_stop_locations.sql` — per-passenger outbound/return pickup/drop-off location IDs.

The 0017–0020 migrations are present in the current worktree but were not part of the latest committed checkpoint.

## 6.3 Route-stop model

The original route model used origin and destination city/location fields only. The route audit found no intermediate-stop support. The current implementation adds:

- `routeStops.routeId`
- `routeStops.locationId`
- `routeStops.stopOrder`
- `routeStops.pickupAllowed`
- `routeStops.dropoffAllowed`

Passenger selections are stored separately for each leg:

- `outboundPickupLocationId`
- `outboundDropoffLocationId`
- `returnPickupLocationId`
- `returnDropoffLocationId`

---

# 7. Theme and UI changes

The project went through several deliberate visual iterations. The final direction in the current worktree is a lighter, mostly blue/green MetroPro interface rather than the earlier strong navy/red system.

## 7.1 Major theme iterations

1. **Initial MetroPro branded UI**
   - Introduced logo, wordmark, customer header and footer.
   - Added blue transportation-oriented branding.

2. **Lighter attractive colors**
   - Reduced heavy blocks and improved field spacing.
   - Unified cards, forms and customer/operations surfaces.

3. **Blue/red animated theme experiment**
   - Added navy/bright-blue/red tokens.
   - Added animated CTA gradients, hover transitions, active states, focus effects, progress animation and seat selection animation.
   - Added reduced-motion handling.

4. **Blue-only header refinement**
   - Removed red from customer/admin/driver headers and header dividers.
   - Kept red only for selected seats, urgent states and error contexts during that iteration.

5. **Soft green/blue palette**
   - Replaced heavy navy and red with softer blue-green tokens.
   - Used off-white backgrounds, soft borders and calmer transitions.

6. **Blue refinement**
   - Added more blue to buttons, links, focus rings, cards and selected-seat states.
   - Generated a blue-letter wordmark variant.

7. **Current mostly-blue/light UI**
   - Blue-dominant customer and staff accents.
   - Green retained for positive/available states.
   - No heavy dark blocks.

## 7.2 Header and layout changes

**Files:**

- `client/src/components/Brand.tsx`
- `client/src/components/Brand.test.ts`
- `client/src/layouts/CustomerLayout.tsx`
- `client/src/layouts/AdminLayout.tsx`
- `client/src/layouts/DriverLayout.tsx`
- `client/src/components/AdminGuard.tsx`
- `client/src/components/DriverGuard.tsx`
- `client/src/components/DashboardLayout.tsx`
- `client/src/components/DashboardLayoutSkeleton.tsx`

Implemented:

- Centered customer navigation between logo and right-side actions.
- Active-page underline treatment.
- Mobile hamburger navigation.
- Customer-only `CustomerLayout` wrapping customer pages.
- Separate utilitarian `AdminLayout` with admin navigation.
- Separate mobile-first `DriverLayout` with driver navigation.
- Removed the obsolete shared dashboard template; both `DashboardLayout.tsx` and `DashboardLayoutSkeleton.tsx` are currently deleted in the worktree.
- Removed staff-route conditional branding from the customer header.
- Latest header consolidation makes customer navigation consistent across Home and inner customer pages.
- Current customer nav set: Home, Routes, Membership, My trips, Sign In/Sign out, Book Now.

## 7.3 Seat-map visual work

**Files:**

- `client/src/components/SeatMap.tsx`
- `client/src/components/SeatMap.test.ts`
- `client/src/index.css`

Implemented:

- Reference chair-diagram visual treatment.
- 11-passenger layout with middle 3M seat.
- Available, selected, held and taken color states.
- Mobile scaling and accessibility styling.
- Later calmer green/blue state colors.
- Mobile route-map zoom and marker tooltip styling were added separately.

## 7.4 Temporary logo state

The supplied MetroPro logo was prepared into:

- `client/public/metropro-wordmark.png`
- `client/public/metropro-wordmark-blue.png`

A later user request temporarily replaced the visible logo with **“Work in Progress”**. The current `Brand.tsx` still renders that temporary text instead of the supplied logo asset. Restoring the final logo is still waiting on the user's decision/final artwork direction.

---

# 8. Audits performed and findings

## 8.1 Initial project/build audit

Findings:

- React 19, Vite, Express, tRPC, Drizzle/MySQL and Stripe architecture confirmed.
- Initial application scaffold was expanded into customer, admin and driver operations.
- Build and test scripts confirmed as `pnpm check`, `pnpm test`, `pnpm build`.

## 8.2 Reminder deduplication audit

**File audited:** `server/services/reminders.ts`

Finding:

- Outbound reminders checked a booking timestamp, but return-leg reminders lacked a durable per-booking/per-departure/per-template deduplication check.

Fix:

- Added departure-level guards before outbound/return reminder loops.
- Added durable return-leg protection.

## 8.3 Seat inventory audit

Audited:

- `server/services/inventory.ts`
- `server/routers/booking.ts`
- `drizzle/schema.ts`
- `client/src/pages/PassengerInfo.tsx`
- Stripe line-item construction.

Findings:

- Original inventory was quantity-based by standard/front type, not physical seat number.
- Seat availability was derived from sold/held counters.
- Checkout originally accepted seat type and quantity rather than physical seat numbers.
- No original seat-assignment table existed.

Result:

- Added additive numbered-seat fields and per-seat availability services while preserving the quantity-based compatibility path.

## 8.4 Intermediate-stop route audit

Audited:

- `drizzle/schema.ts`
- `server/routers/admin.ts`
- `client/src/pages/SearchResults.tsx`
- `client/src/pages/PassengerInfo.tsx`
- `server/routers/public.ts`
- `server/routers/account.ts`
- `server/routers/driver.ts`
- `server/services/route-safety.ts`
- `client/src/components/RouteCreateForm.tsx`

Finding:

- Original routes had origin/destination fields and one pickup/drop-off pair.
- No stops table or intermediate-stop relation existed.
- Departures referenced a route but did not have stop-level passenger choices.

Result:

- Added `routeStops` with ordering and permission flags.
- Added passenger-specific boarding/drop-off fields.
- Updated public search, admin route management, customer booking, account display, driver manifest and tickets.

## 8.5 Google Maps audit

Audited:

- `drizzle/schema.ts`
- `client/src/pages/Home.tsx`
- `client/src/pages/SearchResults.tsx`
- `client/src/pages/PassengerInfo.tsx`
- `client/src/components/Map.tsx`
- `server/_core/map.ts`
- `package.json`
- connector/runtime configuration.

Findings:

- A Maps component and proxy helper already existed but were not used fully in customer search.
- City/location tables lacked coordinates.
- No map library such as Mapbox or Leaflet was installed; the app used the existing Google/Manus proxy approach.
- Browser Maps loading initially failed with a 403 origin-authorization mismatch.

Result:

- Added coordinate columns, seed values, marker support, route geometry, static-map fallback, route map display and connector diagnostics.

## 8.6 Admin/driver portal separation audit

Audited:

- `client/src/App.tsx`
- `server/_core/trpc.ts`
- `server/_core/sdk.ts`
- `client/src/components/AdminGuard.tsx`
- `client/src/components/DriverGuard.tsx`
- `client/src/components/DashboardLayout.tsx`
- `client/src/components/Brand.tsx`
- session storage and cookies.

Findings:

- Customer, admin and driver routes originally shared more branding/layout behavior than desired.
- Backend role guards were already present and were retained.
- Session cookies were shared at the browser/app level, while role-specific client session keys were maintained.

Result:

- Added separate customer/admin/driver layouts.
- Removed staff conditional rendering from the customer shell.
- Added role-specific portal navigation.
- Deleted unused dashboard template files in the current worktree.

## 8.7 Support audit

Finding:

- Customer support form, mutation and `supportTickets` table already existed.
- Admin support list/detail/status procedures and an admin page were missing or incomplete.

Result:

- Added admin support inbox and `/admin/support` route.
- Later added separate customer and driver support destinations.

## 8.8 Customer password-reset audit

Verified:

- Fragment token handling.
- Token hashing and 24-hour expiry.
- Session invalidation through session-version changes.
- Generic reset-request response.
- Rate limiting.

Fix applied:

- Notification failure was prevented from changing the generic reset-request response.

## 8.9 Stripe audit

Investigated:

- Stripe secret/configuration presence.
- Checkout session construction.
- Line items and metadata.
- Webhook signature and fulfillment.
- Account activation/configuration state.
- Safe non-payment test requests.

Finding:

- The reported error was configuration/account readiness related rather than a seat-map or booking-flow redesign issue. The connector setup/live-payment state still needs final production confirmation.

## 8.10 Header uniformity audit

Finding:

- Home did not have a unique header; it used `CustomerLayout` like the other customer pages.
- The visual difference came from conditional `SiteHeader` navigation arrays.

Result:

- Standardized the customer navigation through `Brand.tsx`.
- All listed customer pages now use `CustomerLayout`.

---

# 9. Bugs fixed

1. Duplicate return-leg reminder notifications.
2. Missing durable reminder deduplication for return legs.
3. Customer ID-photo upload size limitation by adding client compression/resizing.
4. Member signup Preview/mobile origin handling.
5. Missing discreet admin login entry.
6. Admin password sign-in and one-time setup/reset flows.
7. Admin setup-link/path/origin issue reported as a 404 or setup error.
8. Driver account provisioning and driver authentication gaps.
9. Missing per-seat database storage.
10. Missing physical seat map and seat-level availability.
11. Seat-map race/hold validation paths.
12. Stripe seat metadata mapping to passengers.
13. Ticket physical-seat display.
14. Google map blank/unavailable state through a server-side static fallback.
15. Google Maps browser-key/Preview-origin diagnostic issue.
16. Route-map mobile framing/zoom.
17. Missing intermediate-stop persistence and ordering.
18. Missing pickup/drop-off permission validation.
19. Stop selections lost or absent on checkout review; quote serialization was corrected.
20. Missing ticket display of passenger-selected stops.
21. Missing customer reschedule button and cutoff explanation.
22. Missing customer password reset.
23. Password reset generic-response inconsistency when notification delivery failed.
24. Admin support inbox absence.
25. Customer/driver support separation.
26. Staff pages sharing customer shell/navigation.
27. Duplicate/obsolete dashboard layout code.
28. Homepage and inner-page customer header inconsistency.
29. Multiple theme regressions involving stale navy/red palette selectors.
30. Header active-navigation underline and centering issues.
31. Seat-map reference graphic not matching the requested chair diagram.

---

# 10. Current tests and status

## Last recorded full validation

- `pnpm check`: **passed**
- `pnpm test`: **passed**
- Test files: **40 passed, 2 skipped** — 42 total
- Tests: **135 passed, 3 skipped** — 138 total
- `git diff --check`: **passed**
- Focused customer/header tests: **15 passed across 5 files**

Skipped tests are the integration tests that require unavailable/conditional external database behavior:

- `server/services/inventory-lock.integration.test.ts`
- `server/services/rescheduling.integration.test.ts`

The test count above is the last recorded validation result. The worktree has subsequently remained uncommitted and should be revalidated before checkpoint/publish.

## Test coverage areas

- Admin access, passwords, reset and session promotion.
- Driver access.
- Guest/member flows.
- Logout.
- Booking round trips.
- Seat map query/rate limiting.
- Seat metadata and numbered seats.
- Inventory transactions and stale holds.
- Seat layout and vehicle capacity.
- Fulfillment/refunds.
- Notifications.
- Password reset.
- Rescheduling.
- Route safety.
- Stripe webhook behavior.
- Customer header, homepage, UI tokens, ticket, checkout and passenger pages.

---

# 11. Complete file inventory

## 11.1 Current uncommitted modifications

### Modified files

```text
client/public/manus-routes.json
client/src/App.tsx
client/src/components/AdminGuard.tsx
client/src/components/Brand.test.ts
client/src/components/Brand.tsx
client/src/components/DriverGuard.tsx
client/src/components/HomeSections.test.ts
client/src/components/HomeSections.tsx
client/src/components/Map.tsx
client/src/components/MetroUI.tsx
client/src/components/SeatMap.tsx
client/src/components/brand-palette.test.ts
client/src/components/ui/button.tsx
client/src/components/ui/progress.tsx
client/src/index.css
client/src/pages/Account.tsx
client/src/pages/AdminHome.tsx
client/src/pages/AdminLogin.tsx
client/src/pages/AdminOperations.tsx
client/src/pages/AdminPages.tsx
client/src/pages/AdminSchedule.tsx
client/src/pages/AdminSetup.tsx
client/src/pages/BookingDetail.tsx
client/src/pages/Checkout.tsx
client/src/pages/Confirmation.tsx
client/src/pages/CreateAccount.tsx
client/src/pages/DriverHome.tsx
client/src/pages/DriverLogin.tsx
client/src/pages/DriverSetup.tsx
client/src/pages/DriverTrip.tsx
client/src/pages/Home.tsx
client/src/pages/Membership.tsx
client/src/pages/NotFound.tsx
client/src/pages/PassengerInfo.tsx
client/src/pages/RescheduleBooking.tsx
client/src/pages/SearchResults.tsx
client/src/pages/SeatSelection.tsx
client/src/pages/Ticket.tsx
client/src/pages/TripDetails.tsx
drizzle/meta/_journal.json
drizzle/schema.ts
server/_core/index.ts
server/_core/map.ts
server/admin-operations-auth.test.ts
server/routers/account.ts
server/routers/admin.ts
server/routers/booking.ts
server/routers/driver.ts
server/routers/member-auth.ts
server/routers/public.ts
server/seed.ts
server/services/fulfillment.ts
server/services/inventory.ts
server/services/notifications.ts
server/services/refund-lifecycle.ts
```

### Deleted in the current worktree

```text
client/src/components/DashboardLayout.tsx
client/src/components/DashboardLayoutSkeleton.tsx
```

### Untracked files in the current worktree

```text
client/public/metropro-wordmark-blue.png
client/public/metropro-wordmark.png
client/src/components/RouteStopsEditor.tsx
client/src/layouts/AdminLayout.tsx
client/src/layouts/CustomerLayout.tsx
client/src/layouts/DriverLayout.tsx
client/src/pages/AdminSupport.tsx
client/src/pages/CustomerSupport.tsx
client/src/pages/DriverSupport.tsx
client/src/pages/ForgotPassword.tsx
client/src/pages/PublicInfo.tsx
client/src/pages/ResetPassword.tsx
drizzle/0017_fluffy_post.sql
drizzle/0018_password_reset_tokens.sql
drizzle/0019_route_stops.sql
drizzle/0020_passenger_stop_locations.sql
server/services/password-reset.test.ts
server/services/password-reset.ts
```

## 11.2 Feature files created or modified over the project history

### Customer/frontend

```text
client/index.html
client/public/favicon.png
client/public/favicon.svg
client/public/logo.png
client/public/logo.svg
client/public/manus-routes.json
client/src/App.tsx
client/src/_core/hooks/useAuth.ts
client/src/components/Brand.tsx
client/src/components/Brand.test.ts
client/src/components/HomeSections.tsx
client/src/components/HomeSections.test.ts
client/src/components/Map.tsx
client/src/components/MetroUI.tsx
client/src/components/MetroUI.test.ts
client/src/components/SeatMap.tsx
client/src/components/SeatMap.test.ts
client/src/components/RouteCreateForm.tsx
client/src/components/RouteStopsEditor.tsx
client/src/components/brand-palette.test.ts
client/src/components/ui/badge.tsx
client/src/components/ui/button.tsx
client/src/components/ui/card.tsx
client/src/components/ui/input.tsx
client/src/components/ui/progress.tsx
client/src/index.css
client/src/lib/format.ts
client/src/lib/format.test.ts
client/src/lib/id-photo.ts
client/src/lib/id-photo.test.ts
client/src/lib/seatLayout.ts
client/src/lib/seatLayout.test.ts
client/src/lib/stripeReceipt.ts
client/src/lib/stripeReceipt.test.ts
client/src/lib/usePrivateDriverPhoto.ts
client/src/pages/Account.tsx
client/src/pages/BookingDetail.tsx
client/src/pages/Checkout.tsx
client/src/pages/Checkout.test.ts
client/src/pages/Confirmation.tsx
client/src/pages/CreateAccount.tsx
client/src/pages/CustomerSupport.tsx
client/src/pages/ForgotPassword.tsx
client/src/pages/Home.tsx
client/src/pages/Membership.tsx
client/src/pages/NotFound.tsx
client/src/pages/PassengerInfo.tsx
client/src/pages/PublicInfo.tsx
client/src/pages/RescheduleBooking.tsx
client/src/pages/ResetPassword.tsx
client/src/pages/SearchResults.tsx
client/src/pages/SeatSelection.tsx
client/src/pages/Ticket.tsx
client/src/pages/Ticket.test.ts
client/src/pages/TripDetails.tsx
```

### Admin/driver frontend

```text
client/src/components/AdminGuard.tsx
client/src/components/AnalyticsDashboard.tsx
client/src/components/DispatchAssignment.tsx
client/src/components/DriverAccountForm.tsx
client/src/components/DriverGuard.tsx
client/src/components/DriverPortrait.tsx
client/src/components/DashboardLayout.tsx
client/src/components/DashboardLayoutSkeleton.tsx
client/src/layouts/AdminLayout.tsx
client/src/layouts/CustomerLayout.tsx
client/src/layouts/DriverLayout.tsx
client/src/pages/AdminHome.tsx
client/src/pages/AdminLogin.tsx
client/src/pages/AdminOperations.tsx
client/src/pages/AdminPages.tsx
client/src/pages/AdminSchedule.tsx
client/src/pages/AdminSetup.tsx
client/src/pages/AdminSupport.tsx
client/src/pages/DriverHome.tsx
client/src/pages/DriverLogin.tsx
client/src/pages/DriverSetup.tsx
client/src/pages/DriverSupport.tsx
client/src/pages/DriverTrip.tsx
```

### Backend

```text
server/_core/context.ts
server/_core/cookies.ts
server/_core/env.ts
server/_core/index.ts
server/_core/map.ts
server/_core/notification.ts
server/_core/oauth.ts
server/_core/publicConfig.ts
server/_core/sdk.ts
server/_core/trpc.ts
server/admin-access.test.ts
server/admin-operations-auth.test.ts
server/admin-password.test.ts
server/admin-reset.test.ts
server/admin-session-promotion.test.ts
server/auth.logout.test.ts
server/db.ts
server/driver-access.test.ts
server/guest-member.test.ts
server/lib/mysql.ts
server/member-auth.test.ts
server/platform.test.ts
server/routers.ts
server/routers/account.ts
server/routers/admin-auth.ts
server/routers/admin.ts
server/routers/booking.ts
server/routers/booking.roundtrip.test.ts
server/routers/booking.seat-map.test.ts
server/routers/booking.seat-metadata.test.ts
server/routers/driver-auth.ts
server/routers/driver.ts
server/routers/member-auth.ts
server/routers/public.ts
server/seed.ts
server/services/admin-auth.ts
server/services/admin-operations.ts
server/services/admin-throttle.ts
server/services/analytics.ts
server/services/analytics.range.test.ts
server/services/checkout-origin.ts
server/services/dispatch.ts
server/services/driver-auth.ts
server/services/driver-private.ts
server/services/fulfillment.ts
server/services/fulfillment.test.ts
server/services/guest-access.ts
server/services/hold-reconciliation.ts
server/services/hold-reconciliation.test.ts
server/services/inventory.ts
server/services/inventory-lock.integration.test.ts
server/services/inventory-transaction.test.ts
server/services/member-auth.ts
server/services/member-profile.ts
server/services/notifications.ts
server/services/notifications.test.ts
server/services/password-reset.ts
server/services/password-reset.test.ts
server/services/policies.ts
server/services/pricing.ts
server/services/refund-lifecycle.ts
server/services/refund-lifecycle.test.ts
server/services/reminders.ts
server/services/rescheduling.ts
server/services/rescheduling.integration.test.ts
server/services/route-safety.ts
server/services/route-safety.test.ts
server/services/seat-inventory.ts
server/services/seat-inventory.test.ts
server/services/seat-layout-eleven.test.ts
server/services/seat-layout.ts
server/services/seat-map-rate-limit.ts
server/services/seat-map-rate-limit.test.ts
server/services/seat-selection.ts
server/services/seat-selection.test.ts
server/services/ticket-seat.ts
server/services/ticket-seat.test.ts
server/services/tickets.ts
server/services/vehicle-capacity.ts
server/services/vehicle-capacity.test.ts
server/stripe/client.ts
server/stripe/products.ts
server/stripe/webhook.ts
server/stripe/webhook.test.ts
server/storage.ts
```

### Shared/database/configuration

```text
app.config.ts
client/src/main.tsx
client/src/const.ts
drizzle.config.ts
drizzle/relations.ts
drizzle/schema.ts
ideas.md
package.json
pnpm-lock.yaml
scripts/send-admin-reset.ts
scripts/send-admin-setup.ts
shared/const.ts
shared/seat-layout.ts
shared/types.ts
vitest.config.ts
```

### Database migration files created during feature development

```text
drizzle/0000_initial_users.sql
drizzle/0001_regular_skrulls.sql
drizzle/0002_yummy_khan.sql
drizzle/0003_fancy_vampiro.sql
drizzle/0004_stale_the_order.sql
drizzle/0005_charming_kitty_pryde.sql
drizzle/0006_motionless_absorbing_man.sql
drizzle/0007_pale_the_initiative.sql
drizzle/0008_fantastic_loners.sql
drizzle/0009_light_thundra.sql
drizzle/0010_tidy_marvel_apes.sql
drizzle/0011_daffy_lady_vermin.sql
drizzle/0012_aromatic_ken_ellis.sql
drizzle/0013_wet_talkback.sql
drizzle/0014_youthful_wolfsbane.sql
drizzle/0015_plain_chronomancer.sql
drizzle/0016_chubby_pete_wisdom.sql
drizzle/0017_fluffy_post.sql
drizzle/0018_password_reset_tokens.sql
drizzle/0019_route_stops.sql
drizzle/0020_passenger_stop_locations.sql
drizzle/meta/0000_snapshot.json
drizzle/meta/0001_snapshot.json
drizzle/meta/0002_snapshot.json
drizzle/meta/0003_snapshot.json
drizzle/meta/0004_snapshot.json
drizzle/meta/0005_snapshot.json
drizzle/meta/0006_snapshot.json
drizzle/meta/0007_snapshot.json
drizzle/meta/0008_snapshot.json
drizzle/meta/0009_snapshot.json
drizzle/meta/0010_snapshot.json
drizzle/meta/0011_snapshot.json
drizzle/meta/0012_snapshot.json
drizzle/meta/0013_snapshot.json
drizzle/meta/0014_snapshot.json
drizzle/meta/0015_snapshot.json
drizzle/meta/0016_snapshot.json
drizzle/meta/_journal.json
```

### Initial scaffold files

The project began from the standard web/database starter and initially created the following infrastructure files and UI primitives in addition to the feature files above:

```text
.dockerignore
.gitignore
.manus-starter-init.json
.prettierignore
.prettierrc
Dockerfile
README.md
components.json
template.json
tsconfig.json
vite.config.ts
pnpm-workspace.yaml
client/public/.gitkeep
client/public/__manus__/debug-collector.js
client/src/components/AIChatBox.tsx
client/src/components/ErrorBoundary.tsx
client/src/components/ManusDialog.tsx
client/src/components/ui/accordion.tsx
client/src/components/ui/alert-dialog.tsx
client/src/components/ui/alert.tsx
client/src/components/ui/aspect-ratio.tsx
client/src/components/ui/avatar.tsx
client/src/components/ui/breadcrumb.tsx
client/src/components/ui/button-group.tsx
client/src/components/ui/calendar.tsx
client/src/components/ui/carousel.tsx
client/src/components/ui/chart.tsx
client/src/components/ui/checkbox.tsx
client/src/components/ui/collapsible.tsx
client/src/components/ui/command.tsx
client/src/components/ui/context-menu.tsx
client/src/components/ui/dialog.tsx
client/src/components/ui/drawer.tsx
client/src/components/ui/dropdown-menu.tsx
client/src/components/ui/empty.tsx
client/src/components/ui/field.tsx
client/src/components/ui/form.tsx
client/src/components/ui/hover-card.tsx
client/src/components/ui/input-group.tsx
client/src/components/ui/input-otp.tsx
client/src/components/ui/item.tsx
client/src/components/ui/kbd.tsx
client/src/components/ui/label.tsx
client/src/components/ui/menubar.tsx
client/src/components/ui/navigation-menu.tsx
client/src/components/ui/pagination.tsx
client/src/components/ui/popover.tsx
client/src/components/ui/radio-group.tsx
client/src/components/ui/resizable.tsx
client/src/components/ui/scroll-area.tsx
client/src/components/ui/select.tsx
client/src/components/ui/separator.tsx
client/src/components/ui/sheet.tsx
client/src/components/ui/sidebar.tsx
client/src/components/ui/skeleton.tsx
client/src/components/ui/slider.tsx
client/src/components/ui/sonner.tsx
client/src/components/ui/switch.tsx
client/src/components/ui/table.tsx
client/src/components/ui/tabs.tsx
client/src/components/ui/textarea.tsx
client/src/components/ui/toggle-group.tsx
client/src/components/ui/toggle.tsx
client/src/components/ui/tooltip.tsx
client/src/components/ui/utils.ts
client/src/contexts/ThemeContext.tsx
client/src/hooks/useComposition.ts
client/src/hooks/useMobile.tsx
client/src/hooks/usePersistFn.ts
client/src/lib/trpc.ts
client/src/lib/utils.ts
client/src/platform.d.ts
server/_core/dataApi.ts
server/_core/heartbeat.ts
server/_core/imageGeneration.ts
server/_core/llm.ts
server/_core/storageProxy.ts
server/_core/systemRouter.ts
server/_core/types/cookie.d.ts
server/_core/types/manusTypes.ts
server/_core/vite.ts
server/storage.ts
shared/_core/errors.ts
```

---

# 12. Incomplete, pending or waiting on input

1. **Commit/checkpoint:** The current worktree has substantial uncommitted changes. The latest commit remains `7c763d0`; the route-stop, password-reset, map, portal-layout, support and theme follow-ups need to be reviewed and committed before they are considered safely checkpointed.
2. **Production email delivery:** `notify()`/password-reset delivery still uses a placeholder/in-app path. SendGrid setup was initiated but needs final credentials, sender verification and application wiring.
3. **Stripe production readiness:** Stripe live-payment/account activation, webhook URL/signing secret and production test payment still need confirmation. Do not treat the supplied payment link as a substitute for server-side Stripe configuration.
4. **Google Maps browser authorization:** The server-side static fallback exists, but the Google Maps JavaScript browser key must be authorized for the final published domain/origin if the fully interactive browser map is required everywhere.
5. **Final logo:** The current visible branding still says `Work in Progress`. The supplied logo assets exist, but the final choice between the supplied wordmark, blue variant or a revised asset is unresolved.
6. **Route-stop business decisions:** Exact real-world intermediate stops, operating schedules, dwell times, stop-specific pricing, luggage policy, and whether every departure serves every stop still need business approval. Current Philadelphia/Harrisburg-style seeded stops are mock/test data.
7. **Stop-aware capacity rules:** The current implementation supports selecting stops and storing them, but production-level segment-capacity controls (preventing overbooking between individual stop pairs) are not yet a complete separate inventory model. The current seat inventory is departure-wide.
8. **Live browser/payment acceptance:** A complete real Stripe sandbox payment, webhook delivery, ticket issuance and second-booking rejection should be rerun after the latest uncommitted changes are checkpointed.
9. **Portal deployment separation:** The current implementation uses separate route namespaces/layouts on one domain (Option B). True subdomains such as `admin.metropro.com` and `driver.metropro.com` remain a future deployment/configuration decision.
10. **Notification channels:** SMS, push notifications and customer-facing email templates are architected/outlined but not all production providers are wired.
11. **Production operations:** Live GPS tracking, waitlists, referral rewards, loyalty points, corporate accounts, dynamic pricing and advanced fleet-maintenance analytics remain Phase Two architecture items.
12. **Final full validation:** Because the worktree contains uncommitted follow-up changes after the last test run, run `pnpm check && pnpm test && pnpm build` again immediately before the next checkpoint or publish.

---

# 13. Recommended next actions

1. Review the uncommitted diff and reconcile any concurrent changes.
2. Decide whether to restore the supplied MetroPro logo or keep the temporary Work in Progress label.
3. Confirm the two real intermediate stops and their pickup/drop-off policies.
4. Finish SendGrid sender/API configuration.
5. Finish Stripe production/test webhook configuration.
6. Authorize the final published domain for the Google Maps browser key.
7. Add segment-level inventory rules if passengers on different stop pairs may share one departure.
8. Run the full validation suite and commit the reviewed worktree as a new checkpoint.
