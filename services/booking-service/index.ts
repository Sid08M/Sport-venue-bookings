import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, BookingStatus } from '@repo/db';
import { createBooking, confirmPayment, cancelPending, cancelBooking } from './booking.service';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Validation schemas
const createBookingSchema = z.object({
  courtId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  bookingType: z.enum(['SOLO', 'COMMUNITY']).optional().default('SOLO'),
});

const confirmPaymentSchema = z.object({
  bookingId: z.string().uuid(),
});

const availabilitySchema = z.object({
  courtId: z.string().uuid(),
  date: z.string(), // format: YYYY-MM-DD
});

// GET /bookings/availability
app.get('/bookings/availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courtId, date } = availabilitySchema.parse(req.query);
    
    // Parse start and end of the day
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        courtId,
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.GATHERING],
        },
        startTime: {
          gte: startOfDay,
        },
        endTime: {
          lte: endOfDay,
        },
      },
      include: {
        players: true,
      },
      orderBy: {
        startTime: 'asc',
      }
    });

    res.json({ courtId, date, bookedSlots: bookings });
  } catch (error) {
    next(error);
  }
});

// GET /bookings/my
app.get('/bookings/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { userId },
          {
            players: {
              some: {
                userId,
                status: 'AUTHORIZED',
              }
            }
          }
        ],
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.GATHERING],
        }
      },
      include: {
        court: {
          include: {
            venue: true,
          }
        },
        players: true,
      },
      orderBy: {
        startTime: 'asc',
      }
    });

    res.json(bookings);
  } catch (error) {
    next(error);
  }
});

// POST /bookings
app.post('/bookings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const data = createBookingSchema.parse(req.body);

    const booking = await createBooking(
      userId,
      data.courtId,
      new Date(data.startTime),
      new Date(data.endTime),
      data.bookingType
    );

    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
});

// POST /bookings/confirm-payment
app.post('/bookings/confirm-payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const { bookingId } = confirmPaymentSchema.parse(req.body);

    const booking = await confirmPayment(bookingId, userId);

    res.json(booking);
  } catch (error) {
    next(error);
  }
});

// POST /bookings/cancel-pending
app.post('/bookings/cancel-pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const { bookingId } = confirmPaymentSchema.parse(req.body);

    const result = await cancelPending(bookingId, userId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /bookings/:id/cancel
app.post('/bookings/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const bookingId = req.params.id;
    const result = await cancelBooking(bookingId, userId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Background sweeper to check expired gathering sessions
async function runGatheringSweeper() {
  console.log('[Cron Worker] Running Community Slot Crowdfunding Sweeper...');
  try {
    const cutoffTime = new Date();
    // 1.5 hours in the future
    cutoffTime.setMinutes(cutoffTime.getMinutes() + 90);

    // Find all bookings with status GATHERING that start before cutoffTime
    const expiredGatherings = await prisma.booking.findMany({
      where: {
        status: BookingStatus.GATHERING,
        startTime: {
          lte: cutoffTime,
        },
      },
      include: {
        players: true,
      }
    });

    for (const booking of expiredGatherings) {
      console.log(`[Cron Worker] Booking ${booking.id} failed to meet capacity before cutoff. Refunding and Cancelling...`);

      // 1. Transition status to CANCELLED
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED },
      });

      // 2. Collect all paymentIntents
      const paymentIntents = booking.players
        .map(p => p.paymentIntent)
        .filter((pi): pi is string => !!pi);

      // 3. Trigger mock refund routine
      if (paymentIntents.length > 0) {
        try {
          const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003';
          const response = await fetch(`${paymentServiceUrl}/payments/refund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntents }),
          });
          
          if (response.ok) {
            console.log(`[Cron Worker] Successfully dispatched refund trigger for booking ${booking.id}`);
          }
          
          // Update player statuses to REFUNDED
          await prisma.bookingPlayer.updateMany({
            where: { bookingId: booking.id },
            data: { status: 'REFUNDED' },
          });

        } catch (err) {
          console.error(`[Cron Worker] Failed to trigger refunds for booking ${booking.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[Cron Worker] Error during gathering sweep:', err);
  }
}

// Run sweeper every 30 seconds for responsive testing
setInterval(runGatheringSweeper, 30000);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.message || err);

  // Zod Validation Error
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors,
    });
  }

  // Custom Conflict Error from LockService or Overlap check
  if (err.status === 409) {
    return res.status(409).json({
      error: err.message || 'Conflict',
    });
  }

  // Default Internal Server Error
  return res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

app.listen(port, () => {
  console.log(`booking-service listening on port ${port}`);
});
