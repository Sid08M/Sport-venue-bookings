import { PrismaClient, BookingStatus, BookingType } from '@prisma/client';

const prisma = new PrismaClient();

async function runTest() {
  console.log('--- Starting Cancellation Pipeline End-to-End Test ---');

  // Find a court and a default user
  const court = await prisma.court.findFirst();
  const user = await prisma.user.findFirst({ where: { phone: '1234567890' } });
  const playerA = await prisma.user.findFirst({ where: { phone: '1111111111' } });

  if (!court || !user || !playerA) {
    console.error('Prerequisites not found in DB. Run seed first.');
    process.exit(1);
  }

  // ----------------------------------------------------
  // TEST 1: Solo Booking Cancellation & Refund
  // ----------------------------------------------------
  console.log('\n--- TEST 1: Solo Booking Cancellation ---');
  
  // Set initial wallet balance
  const initialWallet = Number(user.walletBalance);
  console.log(`Initial wallet balance: $${initialWallet}`);

  // Create a SOLO booking in CONFIRMED state
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  tomorrow.setHours(12, 0, 0, 0);
  const startTime = tomorrow;
  const endTime = new Date(tomorrow.getTime() + 60 * 60 * 1000);

  const soloBooking = await prisma.booking.create({
    data: {
      userId: user.id,
      courtId: court.id,
      startTime,
      endTime,
      totalAmount: 50.0,
      status: BookingStatus.CONFIRMED,
      bookingType: BookingType.SOLO,
      activePlayerCount: 1,
    }
  });

  await prisma.bookingPlayer.create({
    data: {
      bookingId: soloBooking.id,
      userId: user.id,
      amountPaid: 50.0,
      status: 'AUTHORIZED',
    }
  });

  console.log(`Created Solo Booking ID: ${soloBooking.id}. Emulating cancel API request...`);

  // Authenticate & Trigger Cancel
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '1234567890', password: 'password123' })
  });
  const { token } = await loginRes.json() as any;

  const cancelRes = await fetch(`http://localhost:3000/api/bookings/${soloBooking.id}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!cancelRes.ok) {
    console.error('Failed to cancel Solo booking:', await cancelRes.text());
    process.exit(1);
  }
  
  const cancelResult = await cancelRes.json();
  console.log('Cancel response:', cancelResult);

  // Verify wallet incremented
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  const newWallet = Number(updatedUser?.walletBalance);
  console.log(`Updated wallet balance: $${newWallet}`);

  if (newWallet !== initialWallet + 50.0) {
    console.error(`ERROR: Expected wallet balance to be $${initialWallet + 50.0}, got $${newWallet}`);
    process.exit(1);
  }
  console.log('SUCCESS: Solo refund credited back correctly!');

  // Verify booking deleted
  const deletedBooking = await prisma.booking.findUnique({ where: { id: soloBooking.id } });
  if (deletedBooking === null) {
    console.log('SUCCESS: Booking row successfully dropped from DB!');
  } else {
    console.error('ERROR: Booking row still exists in DB');
    process.exit(1);
  }

  // ----------------------------------------------------
  // TEST 2: Community Split Joiner Cancellation (Leaves Match)
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Community Joiner Leave Match ---');

  // Create a COMMUNITY booking in GATHERING state
  const commBooking = await prisma.booking.create({
    data: {
      userId: user.id,
      courtId: court.id,
      startTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
      endTime: new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000),
      totalAmount: 60.0,
      status: BookingStatus.GATHERING,
      bookingType: BookingType.COMMUNITY,
      activePlayerCount: 2,
    }
  });

  // Host Player
  await prisma.bookingPlayer.create({
    data: {
      bookingId: commBooking.id,
      userId: user.id,
      amountPaid: 15.0,
      status: 'AUTHORIZED',
    }
  });

  // Joiner Player (Player A)
  const joinerRecord = await prisma.bookingPlayer.create({
    data: {
      bookingId: commBooking.id,
      userId: playerA.id,
      amountPaid: 15.0,
      status: 'AUTHORIZED',
    }
  });

  const playerAInitialWallet = Number(playerA.walletBalance);
  console.log(`Player A Initial Wallet: $${playerAInitialWallet}`);

  // Login as Player A
  const loginPlayerA = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '1111111111', password: 'password123' })
  });
  const { token: tokenA } = await loginPlayerA.json() as any;

  console.log(`Player A triggering Cancel on Booking ID: ${commBooking.id}...`);
  const cancelJoinRes = await fetch(`http://localhost:3000/api/bookings/${commBooking.id}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokenA}`
    }
  });

  if (!cancelJoinRes.ok) {
    console.error('Failed to cancel join:', await cancelJoinRes.text());
    process.exit(1);
  }

  console.log('Joiner Cancel Response:', await cancelJoinRes.json());

  // Verify Player A refunded
  const updatedPlayerA = await prisma.user.findUnique({ where: { id: playerA.id } });
  const playerANewWallet = Number(updatedPlayerA?.walletBalance);
  console.log(`Player A Updated Wallet: $${playerANewWallet}`);
  if (playerANewWallet !== playerAInitialWallet + 15.0) {
    console.error('ERROR: Player A wallet not refunded correctly!');
    process.exit(1);
  }
  console.log('SUCCESS: Joiner refund credited successfully!');

  // Verify Booking still exists but activePlayerCount decremented
  const updatedCommBooking = await prisma.booking.findUnique({ where: { id: commBooking.id } });
  console.log(`Updated activePlayerCount: ${updatedCommBooking?.activePlayerCount}`);
  if (updatedCommBooking?.activePlayerCount !== 1) {
    console.error('ERROR: Capacity count not decremented!');
    process.exit(1);
  }
  console.log('SUCCESS: Joiner removed and count decremented cleanly!');

  // Clean up community booking
  await prisma.bookingPlayer.deleteMany({ where: { bookingId: commBooking.id } });
  await prisma.booking.delete({ where: { id: commBooking.id } });

  console.log('\n--- Cancellation End-to-End Test Suite Completed Successfully ---');
}

runTest()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
