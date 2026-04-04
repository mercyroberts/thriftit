import { Router, Request, Response } from 'express'
import prisma from '../../lib/prisma'

export const transactionRouter = Router()

// GET /api/transactions/:ref — check transaction status (for frontend polling)
transactionRouter.get(
  '/:ref',
  async (req: Request<{ ref: string }>, res: Response) => {
    const transaction = await prisma.transaction.findUnique({
      where: { paystackRef: req.params.ref },
      select: {
        id: true,
        paystackRef: true,
        amount: true,
        currency: true,
        status: true,
        buyerEmail: true,
        buyerName: true,
        buyerPhone: true,
        createdAt: true,
        updatedAt: true,
        deliveryDetails: {
          select: {
            recipientName: true,
            phone: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            country: true,
            deliveryNotes: true,
          },
        },
        product: {
          select: {
            id: true,
            title: true,
            status: true,
            images: true,
            store: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    })

    if (!transaction) {
      res
        .status(404)
        .json({ error: 'Transaction not found', code: 'NOT_FOUND' })
      return
    }

    res.json({ transaction })
  },
)
