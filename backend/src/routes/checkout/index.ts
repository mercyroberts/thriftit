import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { Prisma } from '@prisma/client'
import prisma from '../../lib/prisma'
import { authMiddleware } from '../../middleware/auth'

const deliverySchema = z.object({
  recipientName: z.string().min(1, 'Recipient name is required'),
  phone: z.string().min(1, 'Delivery phone is required'),
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  deliveryNotes: z.string().optional(),
})

const checkoutSchema = z.object({
  buyerName: z.string().min(1, 'Buyer name is required'),
  buyerEmail: z.string().email('Invalid email address'),
  buyerPhone: z.string().min(1, 'Buyer phone is required'),
  delivery: deliverySchema,
})

export const checkoutRouter = Router()

checkoutRouter.post(
  '/:productId',
  authMiddleware,
  async (req: Request<{ productId: string }>, res: Response) => {
    const result = checkoutSchema.safeParse(req.body)

    if (!result.success) {
      res.status(400).json({
        error: result.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      })
      return
    }

    const { productId } = req.params
    const { buyerName, buyerEmail, buyerPhone, delivery } = result.data
    const paystackRef = uuidv4()

    // Atomic lock: SELECT FOR UPDATE inside a transaction
    let product: { id: string; price: number; currency: string } | null = null
    let transactionId: string | null = null

    try {
      await prisma.$transaction(async (tx) => {
        // Row-level lock — blocks concurrent checkouts for same product
        const rows = await tx.$queryRaw<
          { id: string; status: string; price: number; currency: string }[]
        >(
          Prisma.sql`SELECT id, status, price, currency FROM "Product" WHERE id = ${productId} FOR UPDATE`,
        )

        if (rows.length === 0) {
          throw new Error('NOT_FOUND')
        }

        if (rows[0].status !== 'AVAILABLE') {
          throw new Error('ALREADY_TAKEN')
        }

        product = {
          id: rows[0].id,
          price: rows[0].price,
          currency: rows[0].currency,
        }

        // Reserve the product
        await tx.product.update({
          where: { id: productId },
          data: {
            status: 'RESERVED',
            lockedAt: new Date(),
            lockedBy: buyerEmail,
          },
        })

        // Create pending transaction
        const transaction = await tx.transaction.create({
          data: {
            paystackRef,
            amount: product.price,
            currency: product.currency,
            buyerName,
            buyerEmail,
            buyerPhone,
            productId,
          },
        })

        transactionId = transaction.id

        // Create delivery details linked to transaction
        await tx.deliveryDetails.create({
          data: {
            transactionId: transaction.id,
            ...delivery,
          },
        })
      })
    } catch (err) {
      const message = (err as Error).message
      if (message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' })
        return
      }
      if (message === 'ALREADY_TAKEN') {
        res
          .status(409)
          .json({ error: 'Item already taken', code: 'ALREADY_TAKEN' })
        return
      }
      throw err
    }

    // Paystack initialization — outside the DB transaction
    // so we don't hold the row lock during an HTTP call
    try {
      const paystackRes = await fetch(
        'https://api.paystack.co/transaction/initialize',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: buyerEmail,
            amount: Math.round(product!.price * 100), // kobo/pesewas
            currency: product!.currency,
            reference: paystackRef,
            callback_url: process.env.PAYSTACK_CALLBACK_URL,
          }),
        },
      )

      const paystackData = (await paystackRes.json()) as {
        status: boolean
        data?: { authorization_url: string }
        message?: string
      }

      if (!paystackData.status || !paystackData.data) {
        // Paystack failed — roll back the reservation
        await prisma.deliveryDetails.delete({
          where: { transactionId: transactionId! },
        })
        await prisma.transaction.delete({ where: { paystackRef } })
        await prisma.product.update({
          where: { id: productId },
          data: { status: 'AVAILABLE', lockedAt: null, lockedBy: null },
        })

        res.status(502).json({
          error: paystackData.message || 'Payment initialization failed',
          code: 'PAYMENT_INIT_FAILED',
        })
        return
      }

      res.json({
        authorization_url: paystackData.data.authorization_url,
        reference: paystackRef,
      })
    } catch {
      // Network error calling Paystack — roll back
      await prisma.deliveryDetails.delete({
        where: { transactionId: transactionId! },
      })
      await prisma.transaction.delete({ where: { paystackRef } })
      await prisma.product.update({
        where: { id: productId },
        data: { status: 'AVAILABLE', lockedAt: null, lockedBy: null },
      })

      res.status(502).json({
        error: 'Could not reach payment provider',
        code: 'PAYMENT_INIT_FAILED',
      })
    }
  },
)
