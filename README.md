# MediTrack

A full-stack medication tracker, scheduling engine, and reminder application designed to simplify personal care plan management.

MediTrack allows users to schedule medications across daily target times, recurring intervals, and multi-day cycles, log daily doses, track adherence streaks and completion, monitor inventory depletion, and receive background reminders through browser push notifications even when the web application is closed.

---

## Overview

MediTrack provides a clean and secure interface to coordinate personal care plans with high resilience and deterministic scheduling:
- **Care Plan Customization**: Users define medication details, colors, dosages, forms, and flexible regimens.
- **Log Management & State Progression**: Clear dashboard interface to progress doses through verified states (`scheduled` -> `taken` | `missed` | `skipped`), revert logs, and prevent duplicate records.
- **Inventory & Restock Engine**: Real-time stock depletion on dose logs, non-negative stock bounds, low-stock threshold boundary trips, and replenishment flows.
- **Adherence & Streak Analytics**: Safe percentage calculations (resilient to divide-by-zero on empty histories), on-time vs. late vs. missed classification, and contiguous daily streak tracking.
- **Background Deliveries**: Reliable background reminders notify users at their exact local time via Web Push and Upstash QStash.
- **Universal Layout**: Optimized for desktop sidebar workflows and installable mobile Progressive Web App (PWA) experiences.

---

## Core State Data Structures & Schemas

### 1. Medication State
Represents a medication entry in the user's active care plan.

```typescript
interface Medication {
  id: number
  userId: string
  name: string                 // Cleaned text (min 2 chars, max 80)
  dosage: string               // e.g. "10 mg"
  dosageUnit: string           // e.g. "mg", "ml", "tablets"
  form: string                 // "tablet" | "capsule" | "liquid" | "injection"
  frequency: string            // "Once daily" | "Twice daily" | "Every 8 hours" | "As needed"
  instructions: string | null  // Custom directions (e.g. "Take with food")
  color: 'sky' | 'violet' | 'amber' | 'rose'
  active: boolean              // Inactive preserves history when archived
  startDate: string            // ISO YYYY-MM-DD
  createdAt: Date
  updatedAt: Date
}
```

### 2. Dose Record & State Machine
Tracks individual scheduled and logged dose events.

```typescript
type DoseStatus = 'scheduled' | 'taken' | 'missed' | 'skipped'

interface DoseRecord {
  id?: number
  userId: string
  medicationId: number
  scheduledAt: Date            // Target UTC scheduled timestamp
  takenAt?: Date | null        // Actual timestamp when marked taken
  status: DoseStatus           // Strict state machine status
  occurrenceKey: string        // Idempotency key: "<medicationId>:<YYYY-MM-DD>T<HH:MM>"
  notes?: string | null
}
```

#### Valid State Transitions

```mermaid
stateDiagram-v2
    [*] --> scheduled: Regimen Generation
    scheduled --> taken: takeDose()
    scheduled --> missed: Due window elapsed
    scheduled --> skipped: Patient skip
    taken --> scheduled: undoDose()
    missed --> taken: Retroactive log
    missed --> scheduled: Reset
    skipped --> scheduled: Reset
```

- **Duplicate Prevention**: Evaluated against composite unique index `(userId, occurrenceKey)`. Identical scheduled timestamps reject duplicate inserts.

### 3. Regimen & Scheduling Engine Schema
Supports daily specific times, fixed recurring intervals, and multi-day cycles.

```typescript
type RegimenConfig =
  | {
      type: 'daily_times'
      times: string[] // e.g. ['08:00', '20:00']
    }
  | {
      type: 'interval'
      intervalHours: number // e.g. 6 (every 6 hours)
      startTime: string     // '08:00' anchor
    }
  | {
      type: 'cycle'
      onDays: number        // e.g. 21 (days on medication)
      offDays: number       // e.g. 7 (days off medication)
      times: string[]       // e.g. ['09:00']
      cycleStartDate: string // 'YYYY-MM-DD'
    }
```

### 4. Inventory Tracking Schema
Guarantees non-negative bounds and boundary-trip alerts.

```typescript
interface MedicationInventory {
  medicationId: number
  currentStock: number         // Always >= 0 (strictly floored)
  lowStockThreshold: number    // Trips alert when currentStock <= threshold
  unit?: string                // e.g. "tablets"
  lastRestockedAt?: Date | null
}

interface StockAlert {
  level: 'normal' | 'low' | 'empty'
  message: string
  currentStock: number
  threshold: number
}
```

### 5. Adherence & Streak Analytics Schema
Calculates adherence rates with divide-by-zero protection and contiguous day streaks.

```typescript
interface AdherenceScore {
  totalScheduled: number
  takenCount: number
  missedCount: number
  skippedCount: number
  onTimeCount: number          // Taken within allowable threshold (default 60m)
  lateCount: number            // Taken after allowable threshold
  adherenceRate: number        // 0 to 100% (safe against 0 totalScheduled)
  onTimeRate: number           // 0 to 100%
}

interface StreakMetrics {
  currentStreak: number        // Contiguous adherent days up to today
  longestStreak: number        // Best historical contiguous streak
}
```

---

## Local Development & Setup

### Prerequisites
- **Node.js**: `v20` or higher
- **Package Manager**: `pnpm` (`v11` recommended) or `npm`
- **PostgreSQL**: Neon serverless database (or local PostgreSQL)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/AK-Lmn/meditrack.git
cd meditrack
pnpm install
```

### 2. Environment Variables
Create a `.env.local` or `.env` file with the following variables:
```bash
DATABASE_URL=postgresql://user:password@endpoint.neon.tech/neondb?sslmode=require
BETTER_AUTH_SECRET=your-random-32-character-secret
BETTER_AUTH_URL=http://localhost:3000
QSTASH_TOKEN=your-upstash-qstash-token
QSTASH_CURRENT_SIGNING_KEY=your-upstash-current-signing-key
QSTASH_NEXT_SIGNING_KEY=your-upstash-next-signing-key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
```

### 3. Run Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## Verification & Testing

MediTrack includes a deterministic unit and integration test suite powered by **Vitest**. Tests run completely isolated from external networks and databases in **< 500 ms**.

```bash
# Run unit & integration test suite once
pnpm test

# Run tests in interactive watch mode
pnpm test:watch

# Run TypeScript strict typecheck
pnpm run typecheck

# Run linter
pnpm run lint

# Build for production
pnpm build
```

### Test Suite Coverage
- `tests/scheduler.test.ts`:
  - Regimen generation: daily times, recurring intervals crossing midnight, multi-day cycles ($X$ days on, $Y$ days off).
  - Date math: leap years (Feb 29), month-end roll-overs (Jan 31 -> Feb 28/29, Apr 30 -> May 1), and year transitions (Dec 31 -> Jan 1).
  - Timezone conversion across standard and daylight saving time (positive and negative GMT offsets).
  - Dose state machine transitions (`scheduled` -> `taken`, `missed`, `skipped`, and undo).
  - Duplicate occurrence prevention for identical scheduled timestamps.
- `tests/inventory.test.ts`:
  - Stock decrements accurately on dose logs.
  - Non-negative stock count enforcement (never drops below 0).
  - Low-inventory triggers trip at exact threshold boundaries (`currentStock <= threshold`).
  - Replenishment & restock validation and alert clearing.
- `tests/adherence.test.ts`:
  - Adherence score calculation (% taken vs missed vs skipped).
  - Divide-by-zero protection on empty histories (returns safe 0%).
  - On-time vs late dose classification within allowable threshold.
  - Contiguous day streak calculation and streak breakage on missed doses.
- `tests/validation-and-persistence.test.ts`:
  - Sanitization of medication names, whitespace rejection, min length enforcement.
  - Rejection of negative quantities and invalid intervals.
  - Strict 24-hour time format validation (`00:00` - `23:59`).
  - Safe payload deserialization recovering from corrupted or outdated JSON without throwing or crashing the UI.

---

## Continuous Integration (CI) Pipeline

GitHub Actions CI (`.github/workflows/ci.yml`) runs on every `push` and `pull_request` targeting the `main` branch.

The CI workflow executes the following pipeline with exit-code enforcement:
1. **Checkout & Environment Setup**: Checks out repo, installs Node.js v20 and pnpm with dependency cache.
2. **Dependency Installation**: `pnpm install`
3. **Linter Check**: `pnpm run lint`
4. **Static Typecheck**: `pnpm run typecheck` (`tsc --noEmit`)
5. **Deterministic Test Execution**: `pnpm run test` (runs all Vitest suites)

---

## Technology Stack

| Technology | Purpose |
| :--- | :--- |
| **Next.js 16** | Full-stack React framework (App Router) |
| **React 19** | Modern UI component rendering |
| **TypeScript 5.7** | Strict type safety across client and server |
| **Vitest** | Deterministic, isolated, high-speed test runner |
| **Tailwind CSS v4** | Modern fluid styling and theme tokens |
| **Drizzle ORM** | Type-safe PostgreSQL queries and schema management |
| **Better Auth** | Cookie-based session authentication |
| **Upstash QStash** | Serverless message scheduling and background queue |
| **Web Push** | Standard browser push notifications with VAPID |

---

## License

Private repository. All rights reserved.
