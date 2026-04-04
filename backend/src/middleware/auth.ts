import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
  userId: string
  email: string
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    res
      .status(401)
      .json({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' })
    return
  }

  const token = header.split(' ')[1]

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as AuthPayload
    req.user = payload
    next()
  } catch {
    res
      .status(401)
      .json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' })
  }
}
