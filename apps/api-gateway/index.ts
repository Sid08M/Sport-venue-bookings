import express, { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-default-key-please-change';

// Request Logging
app.use(morgan('dev'));

// CORS Middleware to allow cross-origin requests from the browser
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JWT Validation Middleware
const validateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Attach user properties to headers for downstream services
    req.headers['x-user-id'] = decoded.userId;
    req.headers['x-user-email'] = decoded.email || '';
    req.headers['x-user-role'] = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

app.get('/health', (req, res) => {
  res.json({ status: 'API Gateway is healthy' });
});

// --- Proxy Logic ---

// Public Auth Route
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: process.env.IDENTITY_SERVICE_URL || 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: {
      '^/': '/auth/',
    },
  })
);

// Public Venues Route
app.use(
  '/api/venues',
  createProxyMiddleware({
    target: process.env.USER_SERVICE_URL || 'http://localhost:3004',
    changeOrigin: true,
    pathRewrite: {
      '^/': '/venues/',
    },
  })
);

// Protected routes using validateToken
app.use(
  '/api/users',
  validateToken,
  createProxyMiddleware({
    target: process.env.USER_SERVICE_URL || 'http://localhost:3004',
    changeOrigin: true,
    pathRewrite: {
      '^/': '/',
    },
  })
);

app.use(
  '/api/bookings',
  validateToken,
  createProxyMiddleware({
    target: process.env.BOOKING_SERVICE_URL || 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: {
      '^/': '/bookings/',
    },
  })
);

app.use(
  '/api/payments',
  validateToken,
  createProxyMiddleware({
    target: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: {
      '^/': '/',
    },
  })
);

app.listen(port, () => {
  console.log(`API Gateway listening on port ${port}`);
});
