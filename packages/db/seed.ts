import { PrismaClient, SportType, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Dynamically generate the bcryptjs hash for "password123" to guarantee 100% hashing parity
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash('password123', saltRounds);
  console.log('Generated dynamic bcryptjs hash for password123:', hashedPassword);

  // Clear existing bookings, matches, courts, and venues to avoid any duplicates and keep the DB clean!
  await prisma.bookingPlayer.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.venue.deleteMany({});

  // Create an owner
  const owner = await prisma.user.upsert({
    where: { phone: '+1234567890' },
    update: {
      password: hashedPassword,
    },
    create: {
      name: 'Test Owner',
      phone: '+1234567890',
      email: 'owner@test.com',
      role: UserRole.VENUE_OWNER,
      password: hashedPassword,
    },
  });

  // Create the default player user pre-filled in the login screen (no + prefix)
  await prisma.user.upsert({
    where: { phone: '1234567890' },
    update: {
      password: hashedPassword,
    },
    create: {
      name: 'Default Player',
      phone: '1234567890',
      email: 'player@test.com',
      role: UserRole.PLAYER,
      password: hashedPassword,
      walletBalance: 500.0,
    },
  });

  // Create Player A for matchmaking tests
  await prisma.user.upsert({
    where: { phone: '1111111111' },
    update: {
      password: hashedPassword,
    },
    create: {
      name: 'Player A',
      phone: '1111111111',
      email: 'playera@test.com',
      role: UserRole.PLAYER,
      password: hashedPassword,
      walletBalance: 300.0,
    },
  });

  // Create Player B for matchmaking tests
  await prisma.user.upsert({
    where: { phone: '2222222222' },
    update: {
      password: hashedPassword,
    },
    create: {
      name: 'Player B',
      phone: '2222222222',
      email: 'playerb@test.com',
      role: UserRole.PLAYER,
      password: hashedPassword,
      walletBalance: 300.0,
    },
  });

  // Create Venues and distinct, uniquely named Courts
  const venue1 = await prisma.venue.create({
    data: {
      name: 'Downtown Sports Complex',
      ownerId: owner.id,
      address: '123 Main St, Cityville',
      location: { lat: 40.7128, lng: -74.0060 },
      courts: {
        create: [
          {
            name: 'Downtown Tennis Court 1',
            sportType: SportType.TENNIS,
            basePrice: 50.0,
            hourlyRate: 50.0,
            requiredPlayers: 4,
          },
          {
            name: 'Downtown Basketball Court 1',
            sportType: SportType.BASKETBALL,
            basePrice: 40.0,
            hourlyRate: 40.0,
            requiredPlayers: 10,
          }
        ]
      }
    }
  });

  const venue2 = await prisma.venue.create({
    data: {
      name: 'Uptown Padel Club',
      ownerId: owner.id,
      address: '456 Uptown Ave, Cityville',
      location: { lat: 40.7580, lng: -73.9855 },
      courts: {
        create: [
          {
            name: 'Uptown Padel Court 1',
            sportType: SportType.PADEL,
            basePrice: 60.0,
            hourlyRate: 60.0,
            requiredPlayers: 4,
          },
          {
            name: 'Uptown Padel Court 2',
            sportType: SportType.PADEL,
            basePrice: 60.0,
            hourlyRate: 60.0,
            requiredPlayers: 4,
          }
        ]
      }
    }
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
