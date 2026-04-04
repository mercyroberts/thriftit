import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import prisma from '../../lib/prisma'

export const webhookRouter = Router()

webhookRouter.post('/paystack', async (req: Request, res: Response) => {
  // Always return 200 to Paystack
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY as string
    const signature = req.headers['x-paystack-signature'] as string

    if (!signature) {
      console.warn(
        `[${new Date().toISOString()}] webhook: missing signature header`,
      )
      res.sendStatus(200)
      return
    }

    // Verify HMAC SHA512 signature
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex')

    if (hash !== signature) {
      console.warn(`[${new Date().toISOString()}] webhook: invalid signature`)
      res.sendStatus(200)
      return
    }

    const event = req.body as {
      event: string
      data: { reference: string }
    }

    console.log(
      `[${new Date().toISOString()}] webhook: ${event.event} ref:${event.data.reference}`,
    )

    const reference = event.data.reference

    if (event.event === 'charge.success') {
      const transaction = await prisma.transaction.findUnique({
        where: { paystackRef: reference },
      })

      if (transaction) {
        await prisma.transaction.update({
          where: { paystackRef: reference },
          data: { status: 'COMPLETED' },
        })
        await prisma.product.update({
          where: { id: transaction.productId },
          data: { status: 'SOLD' },
        })
        console.log(
          `[${new Date().toISOString()}] webhook: charge.success — product ${transaction.productId} marked SOLD`,
        )
      }
    }

    if (event.event === 'charge.failed') {
      const transaction = await prisma.transaction.findUnique({
        where: { paystackRef: reference },
      })

      if (transaction) {
        await prisma.transaction.update({
          where: { paystackRef: reference },
          data: { status: 'FAILED' },
        })
        await prisma.product.update({
          where: { id: transaction.productId },
          data: { status: 'AVAILABLE', lockedAt: null, lockedBy: null },
        })
        console.log(
          `[${new Date().toISOString()}] webhook: charge.failed — product ${transaction.productId} released`,
        )
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] webhook: internal error`, err)
  }

  // Always 200
  res.sendStatus(200)
})
