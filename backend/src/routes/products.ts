import { Router, Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'

const createProductSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  price: z.number().positive('Price must be positive'),
  size: z.string().max(50).optional(),
  condition: z.enum(['New', 'Like New', 'Good', 'Fair'], {
    error: 'Condition must be New, Like New, Good, or Fair',
  }),
  images: z
    .array(z.string().url())
    .min(1, 'At least one image is required')
    .max(6, 'Maximum 6 images'),
  tags: z.array(z.string().max(30)).max(10).optional(),
})

const updateProductSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  price: z.number().positive().optional(),
  size: z.string().max(50).optional(),
  condition: z
    .enum(['New', 'Like New', 'Good', 'Fair'], {
      error: 'Condition must be New, Like New, Good, or Fair',
    })
    .optional(),
  images: z.array(z.string().url()).min(1).max(6).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
})

const productSelect = {
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
}

export const productRouter = Router()

// POST /api/products — create product (auth required)
productRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const result = createProductSchema.safeParse(req.body)

  if (!result.success) {
    res.status(400).json({
      error: result.error.issues[0].message,
      code: 'VALIDATION_ERROR',
    })
    return
  }

  const userId = req.user!.userId

  const store = await prisma.store.findUnique({
    where: { userId },
    include: { user: { select: { currency: true } } },
  })

  if (!store) {
    res.status(404).json({
      error: 'You need to create a store first',
      code: 'NO_STORE',
    })
    return
  }

  const { title, description, price, size, condition, images, tags } =
    result.data

  const product = await prisma.product.create({
    data: {
      title,
      description,
      price,
      currency: store.user.currency,
      size,
      condition,
      images,
      tags: tags ?? [],
      storeId: store.id,
    },
    select: productSelect,
  })

  res.status(201).json({ product })
})

// GET /api/products/:id — single product (public)
productRouter.get(
  '/:id',
  async (req: Request<{ id: string }>, res: Response) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: productSelect,
    })

    if (!product) {
      res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' })
      return
    }

    res.json({ product })
  },
)

// PUT /api/products/:id — update product (auth, own product only)
productRouter.put(
  '/:id',
  authMiddleware,
  async (req: Request<{ id: string }>, res: Response) => {
    const result = updateProductSchema.safeParse(req.body)

    if (!result.success) {
      res.status(400).json({
        error: result.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      })
      return
    }

    const userId = req.user!.userId

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { store: { select: { userId: true } } },
    })

    if (!product) {
      res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' })
      return
    }

    if (product.store.userId !== userId) {
      res.status(403).json({
        error: 'You can only edit your own products',
        code: 'FORBIDDEN',
      })
      return
    }

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: result.data,
      select: productSelect,
    })

    res.json({ product: updated })
  },
)

// DELETE /api/products/:id — delete product (auth, own, AVAILABLE only)
productRouter.delete(
  '/:id',
  authMiddleware,
  async (req: Request<{ id: string }>, res: Response) => {
    const userId = req.user!.userId

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { store: { select: { userId: true } } },
    })

    if (!product) {
      res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' })
      return
    }

    if (product.store.userId !== userId) {
      res.status(403).json({
        error: 'You can only delete your own products',
        code: 'FORBIDDEN',
      })
      return
    }

    if (product.status !== 'AVAILABLE') {
      res.status(409).json({
        error: 'Can only delete products with AVAILABLE status',
        code: 'INVALID_STATUS',
      })
      return
    }

    await prisma.product.delete({ where: { id: req.params.id } })

    res.json({ message: 'Product deleted' })
  },
)
