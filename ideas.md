# Metro Pro Design Brief

## Chosen direction

**Northline Trust** (committed). Three alternatives were considered; only this one is used.

Rejected (not implemented):
- Terminal Amber — industrial depot lighting, high-contrast yellow (probability 0.06)
- Glass Corridor — glassy airline-app chrome, cool gray (probability 0.04)
- Heritage Coach — retro striped livery, serif nostalgia (probability 0.03)

Metro Pro is a premium intercity van carrier. It should feel safer and more organized than an informal van flyer, and more personal than a national bus brand.

## Design movement

Quiet transportation modernism: timetable clarity, civic wayfinding, and a restrained luxury interior. Closest to a well-run regional airline app, not a ride-hail splash screen.

## Core principles

1. Booking is a timetable, not a marketplace.
2. Every fare is visible before login pressure.
3. One primary action per screen.
4. Trust is shown with structure: times, seats, pickup names, booking numbers.
5. Operations tools (driver, admin) share the same brand but use denser tables and status chips.

## Color philosophy

Deep navy is the authority color — uniforms, night highways, reliability. Warm paper white keeps the product human. A single copper/amber accent is reserved for prices, remaining seats, and primary CTAs. Status uses semantic greens/reds sparingly.

- Navy `#0B1F3A`
- Ink `#10243F`
- Paper `#F6F1E8`
- Copper `#C47A3A`
- Copper hover `#A8642C`
- Line `#D9D1C4`
- Seat green `#2F6F4E`
- Alert `#9B2C2C`

Light theme only. No dark-mode toggle for MVP.

## Layout paradigm

Mobile-first stacked booking card on a full-bleed hero. Desktop: centered 720px booking column over a wide editorial hero, then a 12-column operations grid for admin. Large tap targets (min 48px). Bottom-nav for signed-in customers; side rail for admin on desktop, stacked sections on mobile.

## Signature elements

- Square navy mark with a simplified dual-lane / northbound route chevron
- Departure cards that look like punched tickets: time left, route right, fare in copper
- **SOLD OUT** as a stamped overlay, not a disabled ghost button
- QR tickets on warm paper with navy header bar
- Dispatch board as a four-van status strip, each van a card with a color status rail

## Interaction philosophy

Fast and confirming. Search is one submit. Payment waits for Stripe confirmation (no optimistic paid state). Driver scan is immediate. Admin edits save in place with a quiet toast.

## Animation

Almost none. 150ms fade/slide for sheets. Seat counts do not bounce. Ticket QR appears statically.

## Typography

- Display / brand: **Fraunces** (soft serif for wordmark and ticket headings)
- UI: **Plus Jakarta Sans** (or system-ui fallback) for forms, tables, buttons
- Tabular figures for times, prices, seat counts
- Body 16–17px; buttons 16px semibold; ticket booking number tracked out

## Brand essence

Reliable north–south service. You know where you stand: seat, time, price.

## Brand voice

Calm, specific, adult. “8:00 AM · 2 seats left · Member $125.” Not “Your adventure awaits.”

## Wordmark / logo

**METRO PRO** — METRO in serif, PRO in small caps sans, with the square route-chevron mark to the left. Mark has no letters inside. Favicon is the square mark on navy.

## Signature brand color

Navy `#0B1F3A` with copper `#C47A3A` as the only promotional accent.
