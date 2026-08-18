# MediTrack

A full-stack medicine tracker and reminder web application for managing medications, schedules, dose logs, and real-time background reminders.

MediTrack uses **Upstash QStash** as a scheduler and **Web Push** as the delivery mechanism to send background push notifications to users even when their browser or application page is completely closed.

---

## Features

### Authentication
- Built with **Better Auth**
- Email/Password user registration
- Email/Password login validation
- Server-side session verification on pages and API handlers
- Secure sign-out

### Medication Management
- Create and edit medications (Name, Dosage, Frequency, Time, Instructions, and Visual Colors)
- Archive active medications to cancel future tracking without losing logged history
- Authoritative validation of medication ownership per user
- Dose tracking (Log dose as taken, or undo dose logs)

### Medication Scheduling & Reminders
- Schedule medication times (interpreted in the user's local timezone)
- Automatically compute next occurrences in local timezone and schedule in UTC via QStash
- Reschedule reminders on medication schedule changes
- Automated cancellation of pending reminders when medications are archived or disabled

### Interactive Dashboard
- Medication list and completion status for the current day
- Adherence overview cards (completion rates, streak tracker)
- Medication history logs with text search
- Modern, fully responsive, fluid layout for mobile and desktop screens

### Background Notifications & Settings
- Browser push notification permission flow
- Manage Web Push subscriptions per device
- Stale/expired device subscription cleanup (automatically prunes HTTP 404/410 endpoints)
- Dedicated settings panel showing real-time configuration status of VAPID settings and device registrations
- Custom timezone selector for reminders

### Progressive Web App (PWA)
- Installable PWA with full web app manifest (`manifest.webmanifest`)
- Custom service worker (`sw.js`) containing static asset caching and offline status detection
- Custom service worker push listener and `notificationclick` handler to focus the active app tab or navigate to `/medicines` on click

### Color Themes
- System, Light, and Dark themes
- OS preference sync via `window.matchMedia`
- Persistent selection storage via LocalStorage

---

## Tech Stack

- **Core Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** CSS variables + Tailwind CSS
- **Authentication:** Better Auth
- **Database Connection:** Neon PostgreSQL client (`pg`)
- **ORM:** Drizzle ORM
- **Scheduler:** Upstash QStash
- **Push Delivery:** Web Push (`web-push`)
- **PWA:** Service Worker API

---

## Reminder Architecture

MediTrack avoids polling loops, memory timeouts (`setInterval`), and costly Vercel Cron rules. Reminders are managed via a serverless-compatible push delivery flow:

```
User creates/saves medication schedule
   │
   ▼
Neon / Drizzle ORM stores schedule
   │
   ▼
Reminder Scheduler computes local target -> UTC Epoch
   │
   ▼
Upstash QStash schedules callback (`notBefore` UTC epoch)
   │
   ▼
[Scheduled Date/Time arrives]
   │
   ▼
QStash invokes /api/reminders/send with HMAC Signature
   │
   ▼
API Route validates signature -> claims status atomically
   │
   ▼
Web Push client signs payload with VAPID Private Key
   │
   ▼
Browser Push Service delivers payload to User Device
   │
   ▼
Service Worker receives 'push' -> displays notification
```

Reminders function when the web application is closed. Background delivery relies on browser/device Web Push API support, active device notification permissions, and network connectivity.

---

## Reminder Reliability & State Machine

Every reminder undergoes a robust, crash-resilient transactional flow in the database to prevent duplicate notifications while ensuring reliable retries.

### States
- `pending`: Registered in DB; QStash scheduled callback has not yet fired.
- `processing`: QStash fired and a serverless instance has atomically claimed the task.
- `delivered`: Push notifications successfully completed and logged in-app; next occurrence is queued.
- `failed`: All push notifications failed due to transient issues; QStash will retry.
- `cancelled`: Medication has been archived or disabled. Callback will be skipped immediately.

### Reliability Guarantees
- **Atomic Claims**: The API route claims processing using an atomic update statement. If two identical requests run concurrently, only one transitions the row to `'processing'`, and the loser exits immediately with a `429` (concurrent retry) or `200` (already complete).
- **Transient Failures**: If push delivery fails due to temporary gateway or connection issues, the row transitions to `'failed'` and returns `HTTP 500`. QStash catches this failure and schedules a retry with exponential backoff.
- **Process Crash Recovery**: If a server instance crashes while in the `'processing'` state, the reminder status will remain unchanged. When QStash retries the message, the endpoint checks if the `'processing'` update timestamp is older than 2 minutes. If so, it classifies the job as stuck, resets it, and runs the delivery.
- **At-Least-Once Semantics**: To ensure medication safety, reminders are transitioned to `'delivered'` *after* the push notifications successfully send. If a process crash occurs immediately after sending but before writing `'delivered'` to the database, a duplicate notification may be sent on retry. Notification tags are used to collapse duplicates on user devices.

---

## Database Schema Overview

The database contains the following tables:
- `user` / `session` / `account` / `verification` (Better Auth managed)
- `medications`: Core medication detail and active state
- `medicationSchedules`: Time of day and frequency guidelines
- `medicationLogs`: Chronological record of logged/scheduled doses
- `medicationReminders`: Tracks scheduled QStash callback ids, timestamps, and state machine status
- `notifications`: History of in-app notifications
- `pushSubscriptions`: Devices registered to receive Web Push notifications per user
- `notificationSettings`: Preferences (reminders enabled, timezone, etc.)

---

## Environment Variables

Configure these variables in your `.env` or Vercel environment:

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | Yes | Connection string to your Neon PostgreSQL database |
| `BETTER_AUTH_SECRET` | Yes | Secret hash key for authentication tokens |
| `BETTER_AUTH_URL` | Yes (Prod) | Canonical URL of the application |
| `QSTASH_TOKEN` | Yes | Token used to authenticate requests to Upstash QStash |
| `QSTASH_CURRENT_SIGNING_KEY` | Yes | Signing key to verify inbound QStash signatures |
| `QSTASH_NEXT_SIGNING_KEY` | Yes | Rotated signing key for QStash signature verification |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`| Yes | VAPID public key exposed to client to subscribe device |
| `VAPID_PRIVATE_KEY` | Yes | VAPID private key to sign Web Push payloads server-side |
| `VAPID_SUBJECT` | Yes | VAPID contact identifier (e.g. `mailto:admin@example.com`) |

---

## Local Development

### Prerequisites
- Node.js (v18+)
- pnpm (recommended package manager)
- A Neon PostgreSQL database instance
- An Upstash account with QStash enabled
- VAPID keys (Generate locally using `npx web-push generate-vapid-keys`)

### Setup Instructions

1. Clone the repository and navigate to the folder:
   ```bash
   git clone <repository-url>
   cd meditrack
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create a `.env` file in the root directory and populate the required variables as documented in the [Environment Variables](#environment-variables) section.

4. Apply the database migrations:
   ```bash
   pnpm exec drizzle-kit migrate
   ```

5. Run the local Next.js development server:
   ```bash
   pnpm dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Database Migrations

MediTrack uses **Drizzle Kit** to manage schema changes. All migrations are tracked inside the `/migrations` folder.

To apply migrations to your database during local setup or deployment pipelines:
```bash
pnpm exec drizzle-kit migrate
```

*Do not run manual DDL statements against the database or drop production tables.*

---

## Deployment

### Next.js App
Deploy the repository directly on Vercel:
1. Connect your GitHub repository to Vercel.
2. Configure all environment variables listed in the [Environment Variables](#environment-variables) section in the project settings.
3. Vercel will automatically build and deploy the App Router code.

### QStash Callback Configuration
- Verify `BETTER_AUTH_URL` is set to the canonical deployment URL (e.g., `https://your-app.vercel.app`).
- When a medication is created, QStash will receive the callback target URL as `${BETTER_AUTH_URL}/api/reminders/send`.

---

## Project Structure

```
├── app/
│   ├── actions/          # Server Actions (medications.ts, notifications.ts, etc.)
│   ├── api/
│   │   ├── auth/         # Better Auth Next.js API catch-all
│   │   └── reminders/
│   │       └── send/     # QStash signature-verified delivery endpoint
│   ├── dashboard-page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/           # Client/Server UI Components (MediTrackDashboard, theme widgets)
├── lib/
│   ├── db/               # Drizzle setup, Neon PostgreSQL connection, database schema
│   ├── auth.ts           # Better Auth server configuration
│   ├── qstash.ts         # Server-side QStash client utility
│   ├── web-push.ts       # Server-side Web Push delivery utility
│   └── reminder-scheduler.ts # Timezone-aware occurrence calculator & scheduler
├── migrations/           # Drizzle SQL migration files
├── public/
│   ├── sw.js             # Service worker handling static assets and push listeners
│   └── manifest.webmanifest # PWA properties and configuration
├── package.json
└── tsconfig.json
```

---

## Limitations & Notes

- **iOS Support**: On iOS 16.4+, users must use the "Add to Home Screen" feature to enable Web Push notifications.
- **Service Worker Caching**: The service worker explicitly excludes authenticated API calls (`/api/auth/*`) and private user mutation endpoints from caching to ensure cookie sessions are handled correctly.
- **Local Reminders Testing**: Local QStash testing requires exposing the local instance via a tunneling software (e.g. `ngrok` or `localtunnel`) so Upstash servers can reach the `/api/reminders/send` API callback.
- **At-Least-Once Semantics**: Extremely rare process crashes between the delivery of the push notification and database status write can result in a duplicated visible notification.
- **Notification Permissions**: Background reminders will not deliver if the device blocks notification delivery or has Do Not Disturb / Focus modes active.

---

## Security

- **Secrets Management**: Secret tokens (`QSTASH_TOKEN`, `VAPID_PRIVATE_KEY`, etc.) are kept server-side and must never be exposed via `NEXT_PUBLIC_` prefixes or client-side bundles.
- **Authentication**: Reminders, medications, and schedules are protected by server-side query filters validating the session owner. Users can never edit, view, or receive reminders for medications belonging to other users.
- **Callback Verification**: The `/api/reminders/send` endpoint rejects requests missing a valid QStash HMAC signature, protecting it against unauthorized public POST requests.
