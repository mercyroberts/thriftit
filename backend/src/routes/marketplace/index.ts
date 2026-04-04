import { Router, Request, Response } from 'express'
import prisma from '../../lib/prisma'

const PAGE_SIZE = 20

export const marketplaceRouter = Router()

// GET /api/marketplace/products — all AVAILABLE products, with filters + pagination
marketplaceRouter.get('/products', async (req: Request, res: Response) => {
  const { category, country, currency, page } = req.query

  const pageNum = Math.max(1, parseInt(page as string) || 1)

  const where: Record<string, unknown> = {
    status: 'AVAILABLE',
  }

  if (category && typeof category === 'string') {
    where.tags = { has: category }
  }

  if (currency && typeof currency === 'string') {
    where.currency = currency.toUpperCase()
  }

  if (country && typeof country === 'string') {
    where.store = { user: { country } }
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        currency: true,
        size: true,
        condition: true,
        images: true,
        tags: true,
        status: true,
        createdAt: true,
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ])

  res.json({
    products,
    pagination: {
      page: pageNum,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    },
  })
})
