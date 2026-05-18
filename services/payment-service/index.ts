import express from 'express';
const app = express();
const port = process.env.PORT || 3003;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('payment-service is running!');
});

app.post('/payments/intent', (req, res) => {
  const { bookingId, amount, userId, bookingType } = req.body;
  
  const paymentIntentId = `pi_${Math.random().toString(36).substring(2, 15)}`;
  const status = bookingType === 'COMMUNITY' ? 'AUTHORIZED' : 'SUCCESS';
  
  console.log(`[PaymentService] Generated Intent ${paymentIntentId} (${status}) for Booking ${bookingId}, User ${userId}, Amount $${amount}`);
  
  res.json({
    paymentIntentId,
    status,
    amount,
    bookingId,
  });
});

app.post('/payments/refund', (req, res) => {
  const { paymentIntents } = req.body;
  console.log(`[PaymentService] Processing refunds for intents:`, paymentIntents);
  res.json({
    success: true,
    message: `Successfully refunded ${paymentIntents?.length || 0} intents.`,
  });
});

app.listen(port, () => {
  console.log(`payment-service listening on port ${port}`);
});
