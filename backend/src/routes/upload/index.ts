import { Router, Request, Response } from 'express'
import multer from 'multer'
import cloudinary from '../../lib/cloudinary'
import { authMiddleware } from '../../middleware/auth'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  },
})

export const uploadRouter = Router()

// POST /api/upload — upload up to 6 images, returns URL array (auth required)
uploadRouter.post(
  '/',
  authMiddleware,
  upload.array('images', 6),
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      res.status(400).json({
        error: 'No images provided',
        code: 'VALIDATION_ERROR',
      })
      return
    }

    const uploadPromises = files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                folder: 'thriftit',
                transformation: [
                  { width: 1200, height: 1200, crop: 'limit', quality: 'auto' },
                ],
              },
              (error, result) => {
                if (error || !result) {
                  reject(error || new Error('Upload failed'))
                } else {
                  resolve(result.secure_url)
                }
              },
            )
            .end(file.buffer)
        }),
    )

    const urls = await Promise.all(uploadPromises)

    res.status(201).json({ urls })
  },
)
