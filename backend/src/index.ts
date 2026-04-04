import dotenv from 'dotenv'
dotenv.config()

import './types/express'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { authRouter } from './routes/auth'
import { storeRouter } from './routes/stores'
import { productRouter } from './routes/products'
import { marketplaceRouter } from './routes/marketplace'
import { uploadRouter } from './routes/upload'
import { checkoutRouter } from './routes/checkout'
import { webhookRouter } from './routes/webhooks'
import { transactionRouter } from './routes/transactions'
import { startLockExpiryJob } from './jobs/expireLocks'
import prisma from './lib/prisma'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(morgan('short'))
app.use(express.json({ limit: '1mb' }))

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    error: 'Too many requests, try again later',
    code: 'RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.user.findFirst({ select: { id: true } })
    res.json({ status: 'ok', db: 'connected' })
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

app.use('/api/auth', authLimiter, authRouter)
app.use('/api/stores', storeRouter)
app.use('/api/products', productRouter)
app.use('/api/marketplace', marketplaceRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/checkout', checkoutRouter)
app.use('/api/webhooks', webhookRouter)
app.use('/api/transactions', transactionRouter)

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  startLockExpiryJob()
})

export default app
