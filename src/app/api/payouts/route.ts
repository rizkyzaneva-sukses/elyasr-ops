import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'

// GET /api/payouts
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const walletId = searchParams.get('walletId') || ''
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 50),
  })

  const where = {
    ...(walletId && { walletId }),
    ...(dateFrom && { releasedDate: { gte: new Date(dateFrom) } }),
    ...(dateTo && { releasedDate: { lte: new Date(dateTo) } }),
  }

  const [payouts, total, sumResult] = await Promise.all([
    prisma.payout.findMany({
      where,
      include: { wallet: { select: { name: true } } },
      orderBy: { releasedDate: 'desc' },
      skip,
      take,
    }),
    prisma.payout.count({ where }),
    prisma.payout.aggregate({
      where,
      _sum: { omzet: true, totalIncome: true, platformFee: true, amsFee: true },
    }),
  ])

  return apiSuccess({
    payouts,
    total,
    summary: {
      totalOmzet: sumResult._sum.omzet ?? 0,
      totalIncome: sumResult._sum.totalIncome ?? 0,
      totalPlatformFee: sumResult._sum.platformFee ?? 0,
      totalAmsFee: sumResult._sum.amsFee ?? 0,
    },
  })
}

// POST /api/payouts — bulk upload from CSV
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { payouts, walletId } = body

  if (!Array.isArray(payouts) || payouts.length === 0) return apiError('Data payout kosong')
  if (!walletId) return apiError('Wallet wajib dipilih')

  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) return apiError('Wallet tidak ditemukan')

  // Check existing order_no to avoid duplicates
  const orderNos = payouts.map((p: any) => String(p.order_no || p.orderNo || ''))
  const existing = await prisma.payout.findMany({
    where: { orderNo: { in: orderNos } },
    select: { orderNo: true },
  })
  const existingSet = new Set(existing.map(e => e.orderNo))

  const newPayouts = payouts.filter((p: any) => {
    const orderNo = String(p.order_no || p.orderNo || '')
    return orderNo && !existingSet.has(orderNo)
  })

  if (newPayouts.length === 0) {
    return apiSuccess({ inserted: 0, skipped: payouts.length, message: 'Semua data sudah ada' })
  }

  // Find matching orders
  const matchOrderNos = newPayouts.map((p: any) => String(p.order_no || p.orderNo))
  const orders = await prisma.order.findMany({
    where: { orderNo: { in: matchOrderNos } },
    select: { id: true, orderNo: true },
    distinct: ['orderNo'],
  })
  const orderMap = new Map(orders.map(o => [o.orderNo, o.id]))

  // Chunked insert — tidak ada batas baris
  const CHUNK = 300
  let inserted = 0

  for (let i = 0; i < newPayouts.length; i += CHUNK) {
    const chunk = newPayouts.slice(i, i + CHUNK)

    const payoutRows = chunk.map((p: any) => {
      const orderNo = String(p.order_no || p.orderNo || '')
      const omzet = Number(p.omzet || 0)
      const platformFee = Number(p.platform_fee || p.platformFee || 0)
      const amsFee = Number(p.ams_fee || p.amsFee || 0)
      const totalIncome = omzet - platformFee - amsFee
      const releasedDate = new Date(p.released_date || p.releasedDate || new Date())
      return { orderNo, omzet, platformFee, amsFee, totalIncome, releasedDate,
               walletId, orderId: orderMap.get(orderNo) ?? null, createdBy: session.username }
    })

    const ledgerRows = chunk.map((p: any) => {
      const orderNo = String(p.order_no || p.orderNo || '')
      const omzet = Number(p.omzet || 0)
      const platformFee = Number(p.platform_fee || p.platformFee || 0)
      const amsFee = Number(p.ams_fee || p.amsFee || 0)
      const totalIncome = omzet - platformFee - amsFee
      const releasedDate = new Date(p.released_date || p.releasedDate || new Date())
      return { walletId, trxDate: releasedDate, trxType: 'PAYOUT' as const,
               category: 'Payout Marketplace', amount: totalIncome,
               refOrderNo: orderNo, note: `Payout order ${orderNo}`, createdBy: session.username }
    })

    await prisma.$transaction([
      prisma.payout.createMany({ data: payoutRows }),
      prisma.walletLedger.createMany({ data: ledgerRows }),
    ])
    inserted += chunk.length
  }

  return apiSuccess({ inserted, skipped: payouts.length - newPayouts.length }, 201)
}
