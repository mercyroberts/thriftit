import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { ProductStatus } from '@prisma/client'
import prisma from '../../lib/prisma'
import { authMiddleware } from '../../middleware/auth'

const createStoreSchema = z.object({
  name: z.string().min(1, 'Store name is required').max(100),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      'Slug must contain only lowercase letters, numbers, and hyphens',
    ),
  description: z.string().max(500).optional(),
})

export const storeRouter = Router()

// POST /api/stores — create store (auth required)
storeRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const result = createStoreSchema.safeParse(req.body)

  if (!result.success) {
    res.status(400).json({
      error: result.error.issues[0].message,
      code: 'VALIDATION_ERROR',
    })
    return
  }

  const { name, slug, description } = result.data
  const userId = req.user!.userId

  const existingStore = await prisma.store.findUnique({
    where: { userId },
  })
  if (existingStore) {
    res.status(409).json({
      error: 'You already have a store',
      code: 'STORE_EXISTS',
    })
    return
  }

  const slugTaken = await prisma.store.findUnique({ where: { slug } })
  if (slugTaken) {
    res.status(409).json({
      error: 'Slug is already taken',
      code: 'SLUG_EXISTS',
    })
    return
  }

  const store = await prisma.store.create({
    data: { name, slug, description, userId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      createdAt: true,
    },
  })

  res.status(201).json({ store })
})

// GET /api/stores — list all stores (public)
storeRouter.get('/', async (_req: Request, res: Response) => {
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      createdAt: true,
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ stores })
})

// GET /api/stores/:slug — single store with owner info (public)
storeRouter.get(
  '/:slug',
  async (req: Request<{ slug: string }>, res: Response) => {
    const store = await prisma.store.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            country: true,
            createdAt: true,
          },
        },
        _count: { select: { products: true } },
      },
    })

    if (!store) {
      res.status(404).json({ error: 'Store not found', code: 'NOT_FOUND' })
      return
    }

    res.json({ store })
  },
)

// GET /api/stores/:slug/products — products for a store (public, ?status filter)
storeRouter.get(
  '/:slug/products',
  async (req: Request<{ slug: string }>, res: Response) => {
    const store = await prisma.store.findUnique({
      where: { slug: req.params.slug },
      select: { id: true },
    })

    if (!store) {
      res.status(404).json({ error: 'Store not found', code: 'NOT_FOUND' })
      return
    }

    const statusFilter = req.query.status as string | undefined
    const where: { storeId: string; status?: ProductStatus } = {
      storeId: store.id,
    }

    if (
      statusFilter &&
      Object.values(ProductStatus).includes(statusFilter as ProductStatus)
    ) {
      where.status = statusFilter as ProductStatus
    }

    const products = await prisma.product.findMany({
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
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ products })
  },
)
