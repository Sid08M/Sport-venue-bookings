import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '@repo/db';

const app = express();
const port = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-default-key-please-change';

app.use(express.json());

// Validation Schemas
const registerSchema = z.object({
  phone: z.string().min(10),
  email: z.string().email().optional(),
  password: z.string().min(6),
  name: z.string().min(2),
});

const loginSchema = z.object({
  phone: z.string().min(10),
  password: z.string(),
});

// POST /auth/register
app.post('/auth/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { phone: data.phone }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'User with this phone number already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        phone: data.phone,
        email: data.email,
        password: hashedPassword,
        name: data.name,
      },
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      }
    });

    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    next(error);
  }
});

// POST /auth/login
app.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { phone: data.phone }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(data.password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      }
    });
  } catch (error) {
    next(error);
  }
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Identity Error:', err.message || err);

  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors,
    });
  }

  return res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

app.listen(port, () => {
  console.log(`identity-service listening on port ${port}`);
});
