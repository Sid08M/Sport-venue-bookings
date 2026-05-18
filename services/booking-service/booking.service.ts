import { prisma, BookingStatus, BookingType } from '@repo/db';
import { lockService } from './LockService';

export async function createBooking(
  userId: string,
  courtId: string,
  startTime: Date,
  endTime: Date,
  bookingType: 'SOLO' | 'COMMUNITY' = 'SOLO'
) {
  // 1. Fetch Court details
  const court = await prisma.court.findUnique({
    where: { id: courtId },
  });
  if (!court) {
    throw new Error('Court not found');
  }

  // 2. Duration and Price Calculation
  const totalHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  if (totalHours <= 0) {
    throw new Error('Invalid booking duration');
  }
  const hourlyRate = Number(court.hourlyRate) > 0 ? Number(court.hourlyRate) : Number(court.basePrice);
  const totalBasePrice = totalHours * hourlyRate;

  const resource = `locks:court:${courtId}:${startTime.getTime()}:${endTime.getTime()}`;
  const ttl = 5000; // 5 seconds lock duration

  let lock;
  try {
    // Acquire redlock
    lock = await lockService.acquireLock(resource, ttl);

    if (bookingType === 'COMMUNITY') {
      // Find an active GATHERING booking exactly overlapping this slot
      const existingGathering = await prisma.booking.findFirst({
        where: {
          courtId,
          startTime,
          endTime,
          status: BookingStatus.GATHERING,
        },
        include: {
          players: true,
        }
      });

      if (existingGathering) {
        // Enforce 1 spot per user
        const alreadyJoined = existingGathering.players.some(p => p.userId === userId);
        if (alreadyJoined) {
          const error: any = new Error('Conflict: You are already a participant in this community match.');
          error.status = 409;
          throw error;
        }

        const splitAmount = totalBasePrice / court.requiredPlayers;

        // Simulate payment auth hold
        let paymentIntentId = null;
        try {
          const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003';
          const response = await fetch(`${paymentServiceUrl}/payments/intent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              bookingId: existingGathering.id,
              amount: splitAmount,
              userId,
              bookingType: 'COMMUNITY',
            }),
          });

          if (response.ok) {
            const data = await response.json() as any;
            paymentIntentId = data.paymentIntentId;
          }
        } catch (err) {
          console.error('[BookingService] Failed to contact payment-service for hold:', err);
        }

        // Add player to BookingPlayers in PENDING_PAYMENT status
        await prisma.bookingPlayer.create({
          data: {
            bookingId: existingGathering.id,
            userId,
            paymentIntent: paymentIntentId,
            amountPaid: splitAmount,
            status: 'PENDING_PAYMENT',
          }
        });

        // Return booking details but with a join flag so client knows it's a join request
        return {
          id: existingGathering.id,
          courtId: existingGathering.courtId,
          startTime: existingGathering.startTime,
          endTime: existingGathering.endTime,
          totalAmount: existingGathering.totalAmount,
          status: BookingStatus.PENDING_PAYMENT,
          bookingType: existingGathering.bookingType,
          activePlayerCount: existingGathering.activePlayerCount,
          paymentIntent: paymentIntentId,
          isJoining: true,
        };
      }
    }

    // Double-check for overlapping bookings (must not be CANCELLED or PENDING_PAYMENT)
    const overlappingBooking = await prisma.booking.findFirst({
      where: {
        courtId,
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.GATHERING]
        },
        OR: [
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gt: startTime } }
            ]
          }
        ]
      }
    });

    if (overlappingBooking) {
      const error: any = new Error('Lock Conflict: Court is already booked or gathering for this slot.');
      error.status = 409;
      throw error;
    }

    // Create a new booking in PENDING_PAYMENT status
    const initialStatus = BookingStatus.PENDING_PAYMENT;
    const initialAmount = bookingType === 'COMMUNITY' ? (totalBasePrice / court.requiredPlayers) : totalBasePrice;

    const newBooking = await prisma.booking.create({
      data: {
        userId,
        courtId,
        startTime,
        endTime,
        totalAmount: totalBasePrice,
        status: initialStatus,
        bookingType: bookingType === 'COMMUNITY' ? BookingType.COMMUNITY : BookingType.SOLO,
        activePlayerCount: 1,
      }
    });

    // Request mock payment intent
    let paymentIntentId = null;
    try {
      const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003';
      const response = await fetch(`${paymentServiceUrl}/payments/intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId: newBooking.id,
          amount: initialAmount,
          userId,
          bookingType,
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        paymentIntentId = data.paymentIntentId;
      }
    } catch (err) {
      console.error('[BookingService] Failed to contact payment-service:', err);
    }

    // Add host to BookingPlayers in PENDING_PAYMENT status
    await prisma.bookingPlayer.create({
      data: {
        bookingId: newBooking.id,
        userId,
        paymentIntent: paymentIntentId,
        amountPaid: initialAmount,
        status: 'PENDING_PAYMENT',
      }
    });

    // Update booking with payment intent ID (mostly for solo legacy compatibility)
    const updatedBooking = await prisma.booking.update({
      where: { id: newBooking.id },
      data: { paymentIntent: paymentIntentId },
      include: {
        players: true,
      }
    });

    return updatedBooking;

  } catch (error: any) {
    if (error.name === 'ExecutionError' || error.status === 409) {
      const conflictError: any = new Error(error.message || 'Conflict: Unable to acquire lock or court is already booked.');
      conflictError.status = 409;
      throw conflictError;
    }
    throw error;
  } finally {
    if (lock) {
      await lock.release().catch((err) => {
        console.error('Failed to release lock', err);
      });
    }
  }
}

export async function confirmPayment(bookingId: string, userId: string) {
  // Find booking
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      players: true,
      court: true,
    }
  });
  if (!booking) throw new Error('Booking not found');

  // Case 1: Hosting or Solo Booking (Booking itself is in PENDING_PAYMENT status)
  if (booking.status === BookingStatus.PENDING_PAYMENT) {
    const finalStatus = booking.bookingType === BookingType.COMMUNITY ? BookingStatus.GATHERING : BookingStatus.CONFIRMED;
    
    // Update Booking status to GATHERING or CONFIRMED
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: finalStatus,
      },
      include: {
        players: true,
      }
    });

    // Update the host player's status to AUTHORIZED
    await prisma.bookingPlayer.updateMany({
      where: {
        bookingId,
        userId,
        status: 'PENDING_PAYMENT',
      },
      data: {
        status: 'AUTHORIZED',
      }
    });

    return updated;
  }

  // Case 2: Joining an existing community booking (Booking is already in GATHERING status)
  const pendingPlayer = await prisma.bookingPlayer.findFirst({
    where: {
      bookingId,
      userId,
      status: 'PENDING_PAYMENT',
    }
  });

  if (pendingPlayer) {
    // 1. Update this player's status to AUTHORIZED
    await prisma.bookingPlayer.update({
      where: { id: pendingPlayer.id },
      data: {
        status: 'AUTHORIZED',
      }
    });

    // 2. Increment activePlayerCount
    const newCount = booking.activePlayerCount + 1;
    const finalBookingStatus = newCount >= booking.court.requiredPlayers ? BookingStatus.CONFIRMED : BookingStatus.GATHERING;

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        activePlayerCount: newCount,
        status: finalBookingStatus,
      },
      include: {
        players: true,
      }
    });

    return updated;
  }

  return booking;
}

export async function cancelPending(bookingId: string, userId: string) {
  // Find booking
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      players: true,
    }
  });
  if (!booking) return { success: true, message: 'No booking to cancel' };

  // Case 1: Hosting or Solo Booking (Booking itself is in PENDING_PAYMENT status)
  if (booking.status === BookingStatus.PENDING_PAYMENT) {
    // Cascade delete everything (Booking and BookingPlayers)
    await prisma.bookingPlayer.deleteMany({
      where: { bookingId }
    });

    await prisma.booking.delete({
      where: { id: bookingId }
    });

    return { success: true, message: 'Pending booking successfully discarded' };
  }

  // Case 2: Joining an existing community booking (Booking is in GATHERING status, we only delete the player's pending row)
  await prisma.bookingPlayer.deleteMany({
    where: {
      bookingId,
      userId,
      status: 'PENDING_PAYMENT',
    }
  });

  return { success: true, message: 'Pending community join successfully discarded' };
}

export async function cancelBooking(bookingId: string, userId: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch booking
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        players: true,
        court: true,
      }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new Error('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.PENDING_PAYMENT) {
      throw new Error('Cannot cancel a booking in pending payment status');
    }

    // Determine type and user role
    const isSolo = booking.bookingType === BookingType.SOLO;
    const isHost = booking.userId === userId;

    if (isSolo) {
      // SOLO booking cancellation:
      // Refund the price to the host user's walletBalance
      const playerRecord = booking.players.find(p => p.userId === userId);
      const refundAmount = playerRecord ? Number(playerRecord.amountPaid) : Number(booking.totalAmount);

      await tx.user.update({
        where: { id: booking.userId },
        data: {
          walletBalance: {
            increment: refundAmount
          }
        }
      });

      // Delete booking player records first due to foreign keys
      await tx.bookingPlayer.deleteMany({
        where: { bookingId }
      });

      // Delete the booking row
      await tx.booking.delete({
        where: { id: bookingId }
      });

      return { success: true, message: 'Solo booking successfully cancelled. Full refund issued to wallet.', refundAmount };
    }

    // Community booking:
    if (isHost) {
      // Community Split Host cancellation:
      // Refund the host and all joined players their respective split amounts
      for (const player of booking.players) {
        await tx.user.update({
          where: { id: player.userId },
          data: {
            walletBalance: {
              increment: Number(player.amountPaid)
            }
          }
        });
      }

      // Delete all player records
      await tx.bookingPlayer.deleteMany({
        where: { bookingId }
      });

      // Delete parent Booking
      await tx.booking.delete({
        where: { id: bookingId }
      });

      return { success: true, message: 'Community booking cancelled by host. All participants refunded.', refundedPlayers: booking.players.length };
    } else {
      // Community Split Joiner cancellation:
      // Find the joiner's BookingPlayer record
      const joinerRecord = booking.players.find(p => p.userId === userId);
      if (!joinerRecord) {
        throw new Error('You are not a participant in this booking');
      }

      // Refund this single player
      await tx.user.update({
        where: { id: userId },
        data: {
          walletBalance: {
            increment: Number(joinerRecord.amountPaid)
          }
        }
      });

      // Delete only their specific BookingPlayer row
      await tx.bookingPlayer.delete({
        where: { id: joinerRecord.id }
      });

      // Decrement capacity count
      const newCount = booking.activePlayerCount - 1;
      
      // If capacity drops below required, ensure status stays/reverts to GATHERING (if it was CONFIRMED)
      const newStatus = newCount < booking.court.requiredPlayers ? BookingStatus.GATHERING : booking.status;

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          activePlayerCount: newCount,
          status: newStatus
        }
      });

      return { success: true, message: 'Successfully left community match. Split refund issued to wallet.', refundAmount: joinerRecord.amountPaid };
    }
  });
}
