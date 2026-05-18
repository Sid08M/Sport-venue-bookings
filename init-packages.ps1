$ErrorActionPreference = "Stop"
Write-Host "Initializing Core Packages..." -ForegroundColor Cyan

# 1. @repo/config
$configDir = "packages\config"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
$configPkgJson = @"
{
  "name": "@repo/config",
  "version": "1.0.0",
  "private": true
}
"@
Set-Content -Path "$configDir\package.json" -Value $configPkgJson
Write-Host "Created @repo/config." -ForegroundColor Green

# 2. @repo/ui
$uiDir = "packages\ui"
New-Item -ItemType Directory -Path $uiDir -Force | Out-Null
$uiPkgJson = @"
{
  "name": "@repo/ui",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts"
}
"@
Set-Content -Path "$uiDir\package.json" -Value $uiPkgJson
Set-Content -Path "$uiDir\index.ts" -Value "// Shared UI components stub"
Write-Host "Created @repo/ui." -ForegroundColor Green

# 3. @repo/utils
$utilsDir = "packages\utils"
New-Item -ItemType Directory -Path $utilsDir -Force | Out-Null
$utilsPkgJson = @"
{
  "name": "@repo/utils",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts"
}
"@
Set-Content -Path "$utilsDir\package.json" -Value $utilsPkgJson
Set-Content -Path "$utilsDir\index.ts" -Value "// Shared utils stub"
Write-Host "Created @repo/utils." -ForegroundColor Green

# 4. @repo/db
$dbDir = "packages\db"
New-Item -ItemType Directory -Path $dbDir -Force | Out-Null
$dbPkgJson = @"
{
  "name": "@repo/db",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts",
  "dependencies": {
    "@prisma/client": "^5.0.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0"
  }
}
"@
Set-Content -Path "$dbDir\package.json" -Value $dbPkgJson
Set-Content -Path "$dbDir\index.ts" -Value "// Prisma Client export stub"

# Prisma Schema
$prismaDir = "$dbDir\prisma"
New-Item -ItemType Directory -Path $prismaDir -Force | Out-Null
$schema = @"
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(uuid())
  phone         String    @unique
  email         String?   @unique
  name          String
  skillRating   Float     @default(1200.0) // ELO base
  walletBalance Decimal   @default(0.0)
  role          UserRole  @default(PLAYER)
  bookings      Booking[]
  matches       Match[]   @relation("MatchPlayers")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Venue {
  id          String   @id @default(uuid())
  ownerId     String
  name        String
  location    Json     // PostGIS Point data representation
  address     String
  isActive    Boolean  @default(true)
  courts      Court[]
  createdAt   DateTime @default(now())
}

model Court {
  id          String   @id @default(uuid())
  venueId     String
  venue       Venue    @relation(fields: [venueId], references: [id])
  name        String
  sportType   SportType
  basePrice   Decimal
  bookings    Booking[]
}

model Booking {
  id            String        @id @default(uuid())
  userId        String
  user          User          @relation(fields: [userId], references: [id])
  courtId       String
  court         Court         @relation(fields: [courtId], references: [id])
  startTime     DateTime
  endTime       DateTime
  totalAmount   Decimal
  status        BookingStatus
  paymentIntent String?
  createdAt     DateTime      @default(now())

  @@index([courtId, startTime, endTime])
}

model Match {
  id        String   @id @default(uuid())
  players   User[]   @relation("MatchPlayers")
  createdAt DateTime @default(now())
}

enum UserRole { PLAYER, VENUE_MANAGER, VENUE_OWNER, SUPER_ADMIN }
enum SportType { TENNIS, BADMINTON, PADEL, FOOTBALL, BASKETBALL }
enum BookingStatus { PENDING, CONFIRMED, CANCELLED, COMPLETED }
"@
Set-Content -Path "$prismaDir\schema.prisma" -Value $schema
Write-Host "Created @repo/db and Prisma schema." -ForegroundColor Green

Write-Host "Packages initialized successfully!" -ForegroundColor Cyan
