# MediTrack

A full-stack medication tracker and reminder application designed to simplify personal care plan management. 

MediTrack allows users to schedule medications, log daily doses, track adherence, and receive background reminders through browser push notifications even when the web application is closed.

---

## Overview

MediTrack provides a clean and secure interface to coordinate daily medication schedules. The platform focuses on user care plan tracking by offering:
- **Care Plan Customization**: Users define medication details, colors, dosages, and schedules.
- **Log Management**: A clear dashboard interface to log doses as taken, undo logs to correct errors, and track history.
- **Background Deliveries**: Background reminders notify users at the exact scheduled local time via browser notifications.
- **Adherence Insights**: Live streaks and completion calculations directly display progress on the dashboard.
- **Universal Layout**: Optimized for desktop sidebar workflows and installable mobile Progressive Web App (PWA) drawer experiences.

---

## Features

### Medication & Care Plan Management
- **Add Medications**: Record name, dosage, frequency description, custom instructions, and custom color identifiers.
- **Archive Medications**: Hide completed or changed medications without deleting historical dose logs.
- **Schedule Times**: Bind medications to specific daily target times. Reminders are calculated relative to the user's selected local timezone.

### Dose Tracking & History
- **Single-Tap Logs**: Mark scheduled medications as taken directly from the dashboard view.
- **Dose Undo**: Revert accidental logs to keep records accurate.
- **Searchable History**: Review all logged doses over time with a search filter.

### Background Reminders
- **Background Delivery**: Reminders are delivered outside the active tab, allowing users to stay informed even when the app is closed.
- **VAPID Subscriptions**: Users register multiple browser instances or devices to receive push events.
- **Stale Subscription Pruning**: Expired browser endpoints (HTTP 404/410) are removed from the database to keep delivery loops clean.

### Dynamic Themes & PWA
- **Theme Selection**: Seamless support for Light, Dark, and System color preferences.
- **Installable PWA**: Register and install the application as a standalone app on supported mobile and desktop browsers.
- **Action Links**: Tapping notifications launches the application and redirects the user directly to their medicines list.

### Secure Accounts
- **Registration & Login**: Secure account creation with email and password.
- **Private Data Workspace**: Separate user dashboards ensure users only access and modify their own medication records.

---

## Reminder Architecture

MediTrack uses a serverless-friendly, push-based reminder flow. Rather than running persistent, polling background tasks, the system schedules reminders on demand:

1. **Schedule Registration**: When a user creates a medication, the system calculates the local target time and converts it to a UTC epoch.
2. **Background Queue**: A callback payload is registered with **Upstash QStash** containing the target UTC execution timestamp.
3. **Trigger Event**: At the exact UTC time, QStash calls the MediTrack reminders endpoint.
4. **Signature Verification**: The API route verifies the request's HMAC signature using signing keys to reject public requests.
5. **State Claim**: The system validates the medication's active status and ownership, then atomically claims the reminder.
6. **Push Event**: The server signs the reminder payload with a **VAPID Private Key** and forwards it to the browser push service.
7. **Service Worker Delivery**: The browser's active service worker catches the push event, displays the notification, and handles click navigation.
8. **Chained Recurrence**: After delivery, the system schedules the next daily occurrence.

---

## Reliability & Fault Tolerance

The reminder delivery pipeline uses a database-backed state machine to handle network errors, server crashes, and duplicate events:

- **State Machine States**: Every occurrence moves through states: `pending` (scheduled), `processing` (currently delivering), `delivered` (successful push), `failed` (transient failure), or `cancelled` (archived).
- **At-Least-Once Delivery**: To ensure users do not miss critical medication times, the status transitions to `delivered` *after* the push notifications are accepted by the push service.
- **Crash Recovery**: If a server instance crashes during delivery, the reminder remains in `processing`. On the next QStash retry, the system detects if the `processing` state has been active for more than 2 minutes. If it has, it classifies the job as stuck, resets it, and retries the delivery.
- **Duplicate Protection**: Concurrent executions are resolved through atomic database updates. The second attempt is rejected with a `429` status code, forcing QStash to retry later. If the database indicates that a reminder has already transitioned to `delivered` or `cancelled`, the request exits immediately with `200` to prevent duplicate alerts.
- **Notification Collapsing**: Notifications are sent with an occurrence-specific `tag`. If a duplicate push is delivered, the user's operating system collapses the alerts, preventing multiple pop-ups.

---

## Technology Stack

| Technology | Purpose |
| :--- | :--- |
| **Next.js** | Full-stack React framework (App Router) |
| **React** | Component-based user interface |
| **TypeScript** | Type-safe application development |
| **Tailwind CSS** | Styling and responsive design |
| **Better Auth** | Authentication and session management |
| **Neon PostgreSQL** | Serverless relational database |
| **Drizzle ORM** | Schema definition and database queries |
| **Upstash QStash** | Serverless message scheduling and queue |
| **Web Push** | Standard browser push notifications |

---

## Application Architecture

The application is structured into the following layers:
- **Presentation Layer**: React components handling state, layout routing, light/dark styling, and the PWA service worker.
- **Business Logic Layer**: Server Actions managing medication mutations, logging, and timezone translation.
- **Scheduling Layer**: Upstash QStash client delivering scheduled callbacks to verification middleware.
- **Authentication Layer**: Better Auth handling login flows and verifying cookies/session headers.
- **Persistence Layer**: Neon PostgreSQL database managed via Drizzle ORM schemas.

---

## Design & Branding

- **Modern Interface**: Uses fluid grids, CSS variables, and Tailwind themes.
- **Branded Assets**: Custom MediTrack logo marks are placed in sidebar headers and authentication views.
- **Accessible Loading Screen**: The application features a server-rendered branded loading screen that matches the user's selected theme background. It center-aligns the logo icon, features an animated loading bar, and respects OS `prefers-reduced-motion` settings.

---

## Security & Privacy

- **Server-Side Authorization**: Every action and database query checks the session user's ID against the target medication's owner ID.
- **Credential Protection**: Database secrets, signing keys, and VAPID private keys are stored in secure environment variables and never exposed to the client.
- **Callback Verification**: The reminder API endpoint enforces cryptographically signed HMAC signatures on all inbound QStash requests.
- **Encrypted Payloads**: All Web Push notification payloads are encrypted using the browser's standard push protocol.

---

## Project Status

MediTrack is a finished medication tracking application featuring complete medication management, authentication, scheduled reminders, background browser push notifications, PWA support, and theme synchronization.
