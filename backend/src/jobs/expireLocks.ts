import cron from 'node-cron'
import prisma from '../lib/prisma'

const LOCK_TIMEOUT_MINUTES = 10

export function startLockExpiryJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MINUTES * 60 * 1000)

      const expiredProducts = await prisma.product.findMany({
        where: {
          status: 'RESERVED',
          lockedAt: { lt: cutoff },
        },
        select: { id: true },
      })

      for (const product of expiredProducts) {
        await prisma.product.update({
          where: { id: product.id },
          data: { status: 'AVAILABLE', lockedAt: null, lockedBy: null },
        })

        await prisma.transaction.updateMany({
          where: { productId: product.id, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        })

        console.log(
          `[${new Date().toISOString()}] cron: expired lock on product ${product.id}`,
        )
      }
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] cron: lock expiry job failed`,
        err,
      )
    }
  })

  console.log('Lock expiry cron job started (runs every 60s)')
}
