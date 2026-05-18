import express, { Request, Response, NextFunction } from 'express';
import { prisma } from '@repo/db';

const app = express();
const port = process.env.PORT || 3004;

app.use(express.json());

app.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        skillRating: true,
        walletBalance: true,
        role: true,
        createdAt: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('User Service Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/venues', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const venues = await prisma.venue.findMany({
      include: {
        courts: true,
      },
    });
    res.json(venues);
  } catch (error) {
    console.error('Fetch Venues Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`user-service listening on port ${port}`);
});
