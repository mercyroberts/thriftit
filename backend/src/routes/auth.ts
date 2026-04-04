import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import prisma from '../lib/prisma'

const VALID_COUNTRIES = [
  'Nigeria',
  'Ghana',
  'Kenya',
  'South Africa',
  'Ireland',
] as const
const CURRENCY_MAP: Record<string, string> = {
  Nigeria: 'NGN',
  Ghana: 'GHS',
  Kenya: 'KES',
  'South Africa': 'ZAR',
  Ireland: 'EUR',
}

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  country: z.enum(VALID_COUNTRIES, {
    error: `Country must be one of: ${VALID_COUNTRIES.join(', ')}`,
  }),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const authRouter = Router()

authRouter.post('/register', async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body)

  if (!result.success) {
    res.status(400).json({
      error: result.error.issues[0].message,
      code: 'VALIDATION_ERROR',
    })
    return
  }

  const { email, password, name, country } = result.data
  const currency = CURRENCY_MAP[country]

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({
      error: 'Email already registered',
      code: 'EMAIL_EXISTS',
    })
    return
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      country,
      currency,
    },
    select: {
      id: true,
      email: true,
      name: true,
      country: true,
      currency: true,
      createdAt: true,
    },
  })

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: '7d' },
  )

  res.status(201).json({ user, token })
})

authRouter.post('/login', async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body)

  if (!result.success) {
    res.status(400).json({
      error: result.error.issues[0].message,
      code: 'VALIDATION_ERROR',
    })
    return
  }

  const { email, password } = result.data

  const user = await prisma.user.findUnique({ where: { email } })

  // Always run bcrypt.compare to prevent timing attacks that leak whether an email exists
  const DUMMY_HASH =
    '$2a$12$000000000000000000000uGPbHEK0LOGOxqSbMGaFfNLmBiRVnaq'
  const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH)

  if (!user || !valid) {
    res.status(401).json({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    })
    return
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: '7d' },
  )

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      country: user.country,
      currency: user.currency,
      createdAt: user.createdAt,
    },
    token,
  })
})
