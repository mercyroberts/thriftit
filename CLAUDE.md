# ThriftIt — Claude Code Context

## What this is

ThriftIt is a thrift marketplace where vendors (currently selling on WhatsApp and Instagram) can create storefronts and sell one-of-one items. The core mechanic is **first-to-pay wins** — the first buyer to complete payment secures the item. No exceptions.

## Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS → deployed on Vercel
- **Backend:** Node.js, TypeScript, Express → deployed on Railway
- **Database:** PostgreSQL via Supabase, ORM is Prisma
- **Payments:** Paystack (supports NGN, GHS, KES, ZAR)
- **Images:** Cloudinary
- **AI:** Claude API — claude-sonnet-4-6 (AI listing description generation, Pro feature)
- **Wireframe:** https://github.com/mercyroberts/thrift-it-wireframe

## Repo structure

/frontend Next.js app
/backend Express API
CLAUDE.md this file

## Markets

Nigeria — NGN — symbol: ₦ — Paystack NG
Ghana — GHS — symbol: GH₵ — Paystack GH
Kenya — KES — symbol: KSh — Paystack KE
South Africa — ZAR — symbol: R — Paystack ZA
EU countries

## The locking logic — read this before touching anything payment-related

This is the most critical feature. A bug here means two buyers pay for the same item.

CHECKOUT FLOW (POST /api/checkout/:productId)

1. Open a Prisma transaction with SELECT FOR UPDATE to lock the product row
2. If product.status !== AVAILABLE → return 409 "Item already taken"
3. If product.status === AVAILABLE:
   - Set status = RESERVED
   - Set lockedAt = now()
   - Set lockedBy = buyer email
4. Create a Transaction record with status = PENDING
5. Call Paystack initialize → get authorization_url
6. Return authorization_url to frontend

PAYSTACK WEBHOOK (POST /api/webhooks/paystack)

- Always verify x-paystack-signature header using HMAC SHA512 with PAYSTACK_SECRET_KEY
- Always return 200 to Paystack even on internal errors — log but never fail the webhook
- charge.success → Transaction.status = COMPLETED, Product.status = SOLD
- charge.failed → Transaction.status = FAILED, Product.status = AVAILABLE, clear lockedAt and lockedBy
- Webhook route must NOT be behind auth middleware

BACKGROUND JOB (runs every 60 seconds via node-cron)

- Find Products where status = RESERVED AND lockedAt < now() minus 10 minutes
- Set back to AVAILABLE, clear lockedAt and lockedBy
- Set linked Transaction to EXPIRED
- Never use setTimeout for lock expiry — cron job only

## Database schema

model User {
id String @id @default(cuid())
email String @unique
password String
name String
country String
currency String
createdAt DateTime @default(now())
store Store?
}

model Store {
id String @id @default(cuid())
slug String @unique
name String
description String?
imageUrl String?
userId String @unique
user User @relation(fields: [userId], references: [id])
products Product[]
createdAt DateTime @default(now())
}

model Product {
id String @id @default(cuid())
title String
description String
price Float
currency String
size String?
condition String
images String[]
tags String[]
status ProductStatus @default(AVAILABLE)
storeId String
store Store @relation(fields: [storeId], references: [id])
transaction Transaction?
lockedAt DateTime?
lockedBy String?
createdAt DateTime @default(now())
}

model Transaction {
id String @id @default(cuid())
paystackRef String @unique
amount Float
currency String
status TransactionStatus @default(PENDING)
buyerEmail String
buyerName String
buyerPhone String?
deliveryAddress String?
productId String @unique
product Product @relation(fields: [productId], references: [id])
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
}

enum ProductStatus { AVAILABLE RESERVED SOLD }
enum TransactionStatus { PENDING COMPLETED FAILED EXPIRED }

## Monetisation

- Free tier: 10 items, basic storefront
- Pro tier: 5000-10000 NGN/month — unlimited items, AI listing tools, analytics
- Transaction fee: 0% at launch, introduce 1.5% once adoption is established
- Ads we need to decide on a ad tool to integrate
- AI features are Pro only — check vendor plan before calling Claude API

## Code standards

- TypeScript strict mode throughout
- Zod for all input validation
- All errors return { error: string, code: string }
- Prisma for all DB operations — no raw SQL except SELECT FOR UPDATE lock
- Mobile-first CSS with Tailwind
- Reference wireframe repo for all UI layout decisions
