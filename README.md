-> Sports-venue-booking Monorepo plaatform

A high-performance, reactive sports venue and court matchmaking ecosystem built using a distributed microservice architecture, Turborepo, Next.js, Redis, and Prisma.

-> System Architecture & Port Matrix

All client traffic passes through our central API Gateway, which handles cross-origin resource orchestration and routes payloads to the dedicated backend microservice handlers:

| Component / Service | Network Location | Core Workspace Path | Core Responsibility |
| :--- | :--- | :--- | :--- |
| **API Gateway** | `http://localhost:3000` | `/apps/api-gateway` | Main ingress proxy; unified application routing cluster |
| **Booking Service** | `http://localhost:3001` | `/services/booking-service` | Dynamic slot scheduling, capacity validation, & cancellations |
| **Identity Service** | `http://localhost:3002` | `/services/identity-service` | Phone-based user authentication, JWT processing, & bcrypt hashes |
| **Payment Service** | `http://localhost:3003` | `/services/payment-service` | Multi-tenant wallet ledgering, balance shifts, & transaction holds |
| **User Service** | `http://localhost:3004` | `/services/user-service` | Skill rating tracking (1200 base ELO), profile management, & player states |
| **Web Admin UI** | `http://localhost:3005` | `/apps/web-admin` | Next.js visual administration dashboard with reactive state engine |

---

-> Local Development Setup Instructions

Follow this execution sequence to clone, build, link, and get the entire cluster sandbox workspace locally:

1. Install Dependencies
Initialize the monorepo workspace matrix and link shared packages:
```bash
npm install
2. Configure Environment Variables
Create a master .env file inside your root directory (Project1/) and define your PostgreSQL target parameters:

Code snippet
DATABASE_URL="postgresql://username:password@localhost:5432/sportsos?schema=public"
3. Hydrate Database (Seed Data)
Reset local PostgreSQL containers, apply active Prisma schemas, run compilation types, and inject secure pre-hashed testing accounts:

Bash
npx prisma db push --force-reset --schema packages/db/prisma/schema.prisma
npm run seed
4. Fire Up the Dev Cluster
Launch all frontend UI runtimes and backend service endpoints concurrently via the parallel Turborepo runtime processor:

Bash
npm run dev
Once running, navigate to http://localhost:3005 inside your web browser to access the live web dashboard!

-> Default Sandbox Test Profiles
The platform utilizes phone-string credential pairs for login validation. Use these default, fully funded accounts to test variables, court button color transitions, and matching states:

Test Player A (Standard Matchmaking User):

Phone Number: 1111111111

Default Password: password123

Initial Ledger Hold: $300.00 (Fully funded for multi-hour court test slots)

Skill Parameter: 1200 ELO

Test Player B (Community Split Joiner User):

Phone Number: 2222222222

Default Password: password123

Initial Ledger Hold: $300.00

Skill Parameter: 1200 ELO

Test Venue Owner (Platform System Administrator):

Phone Number: +1234567890

Default Password: password123

Profile Boundary Account: VENUE_OWNER (Used to review dashboard parameters and telemetry stats)

-> Transactional Booking Lifecycle Rules
To prevent data corruption, orphaned records, or ghost venue lockouts, the system runs a strict state machine workflow:

PENDING_PAYMENT: When a user initializes a booking slot request, a draft entry is held in PostgreSQL with a temporary status flag to protect the court slot time.

GATEWAY HANDSHAKE: The client triggers a checkout transaction loop against the Payment Service (Port 3003).

COMMIT STATE: * Success: Upon successful balance deduction, the status flips to CONFIRMED (Solo) or GATHERING (Community). The UI turns RED or NEON GREEN respectively.

Cancellation: If the user exits the payment modal (clicks X), an explicit cancellation trigger deletes the draft row immediately, clearing the court slot instantly without stale caching leakage.
