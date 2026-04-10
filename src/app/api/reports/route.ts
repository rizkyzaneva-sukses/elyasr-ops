import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const type = searchParams.get('type') || 'summary'

  const dateFilter = dateFrom && dateTo ? {
    orderCreatedAt: { gte: dateFrom, lte: dateTo + ' 23:59:59' }
  } : {}

  if (type === 'summary') {
    const [omzetData, payoutData, expenseData, topSkus] = await Promise.all([
      // Omzet per platform
      prisma.order.groupBy({
        by: ['platform'],
        where: {
          ...dateFilter,
          NOT: [
            { status: { contains: 'batal' } },
            { status: { contains: 'Cancel' } },
            { status: { contains: 'Dibatalkan' } },
          ],
        },
        _sum: { realOmzet: true, hpp: true, qty: true },
        _count: { id: true },
      }),

      // Payout summary
      prisma.payout.aggregate({
        where: dateFrom ? {
          releasedDate: { gte: new Date(dateFrom), lte: new Date(dateTo + 'T23:59:59') }
        } : {},
        _sum: { totalIncome: true, omzet: true, platformFee: true, amsFee: true },
        _count: { id: true },
      }),

      // Expense dari wallet ledger
      prisma.walletLedger.aggregate({
        where: {
          trxType: 'EXPENSE',
          ...(dateFrom && {
            trxDate: { gte: new Date(dateFrom), lte: new Date(dateTo + 'T23:59:59') }
          }),
        },
        _sum: { amount: true },
        _count: { id: true },
      }),

      // Top SKU by omzet
      prisma.order.groupBy({
        by: ['sku'],
        where: {
          ...dateFilter,
          sku: { not: null },
          NOT: [
            { status: { contains: 'batal' } },
            { status: { contains: 'Cancel' } },
          ],
        },
        _sum: { realOmzet: true, qty: true },
        orderBy: { _sum: { realOmzet: 'desc' } },
        take: 10,
      }),
    ])

    const totalOmzet = omzetData.reduce((s, p) => s + (p._sum.realOmzet ?? 0), 0)
    const totalHpp = omzetData.reduce((s, p) => s + (p._sum.hpp ?? 0), 0)
    const totalExpense = Math.abs(expenseData._sum.amount ?? 0)

    return apiSuccess({
      omzet: {
        total: totalOmzet,
        byPlatform: omzetData.map(p => ({
          platform: p.platform,
          omzet: p._sum.realOmzet ?? 0,
          hpp: p._sum.hpp ?? 0,
          qty: p._sum.qty ?? 0,
          orders: p._count.id,
          grossProfit: (p._sum.realOmzet ?? 0) - (p._sum.hpp ?? 0),
          margin: p._sum.realOmzet
            ? (((p._sum.realOmzet ?? 0) - (p._sum.hpp ?? 0)) / (p._sum.realOmzet ?? 1) * 100).toFixed(1)
            : '0',
        })),
      },
      grossProfit: totalOmzet - totalHpp,
      grossMargin: totalOmzet > 0
        ? (((totalOmzet - totalHpp) / totalOmzet) * 100).toFixed(1)
        : '0',
      payout: {
        count: payoutData._count.id,
        totalIncome: payoutData._sum.totalIncome ?? 0,
        platformFee: payoutData._sum.platformFee ?? 0,
        amsFee: payoutData._sum.amsFee ?? 0,
      },
      expense: {
        total: totalExpense,
        count: expenseData._count.id,
      },
      netCashflow: (payoutData._sum.totalIncome ?? 0) - totalExpense,
      topSkus: topSkus.map(s => ({
        sku: s.sku,
        omzet: s._sum.realOmzet ?? 0,
        qty: s._sum.qty ?? 0,
      })),
    })
  }

  // Monthly breakdown
  if (type === 'monthly') {
    const monthly = await prisma.$queryRaw<any[]>`
      SELECT
        TO_CHAR(TO_DATE(SUBSTRING(order_created_at, 1, 10), 'YYYY-MM-DD'), 'YYYY-MM') AS month,
        platform,
        COUNT(*) AS order_count,
        SUM(real_omzet) AS omzet,
        SUM(hpp) AS hpp
      FROM orders
      WHERE status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
        ${dateFrom ? prisma.$queryRaw`AND order_created_at >= ${dateFrom}` : prisma.$queryRaw``}
        ${dateTo ? prisma.$queryRaw`AND order_created_at <= ${dateTo + ' 23:59:59'}` : prisma.$queryRaw``}
      GROUP BY month, platform
      ORDER BY month DESC, platform
    `
    return apiSuccess({ monthly: monthly.map(m => ({ ...m, orderCount: Number(m.order_count), omzet: Number(m.omzet), hpp: Number(m.hpp) })) })
  }

  return apiError('Report type tidak dikenali')
}
