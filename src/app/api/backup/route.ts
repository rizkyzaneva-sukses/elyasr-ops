import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const entity = searchParams.get('entity') || 'all'

  // Export per entity atau semua sekaligus
  const exporters: Record<string, () => Promise<any>> = {
    products: () => prisma.masterProduct.findMany(),
    categories: () => prisma.productCategory.findMany(),
    orders: () => prisma.order.findMany({ orderBy: { createdAt: 'desc' } }),
    payouts: () => prisma.payout.findMany(),
    wallets: () => prisma.wallet.findMany(),
    wallet_ledger: () => prisma.walletLedger.findMany({ orderBy: { trxDate: 'desc' } }),
    purchase_orders: () => prisma.purchaseOrder.findMany({ include: { items: true } }),
    vendors: () => prisma.vendor.findMany(),
    vendor_payments: () => prisma.vendorPayment.findMany(),
    inventory_ledger: () => prisma.inventoryLedger.findMany({ orderBy: { trxDate: 'desc' } }),
    utangs: () => prisma.utang.findMany({ include: { payments: true } }),
    piutangs: () => prisma.piutang.findMany({ include: { collections: true } }),
    audit_logs: () => prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 }),
  }

  if (entity !== 'all' && !exporters[entity]) {
    return apiError('Entity tidak dikenali')
  }

  if (entity === 'all') {
    const result: Record<string, any[]> = {}
    for (const [key, fn] of Object.entries(exporters)) {
      result[key] = await fn()
    }
    return apiSuccess({
      exportedAt: new Date().toISOString(),
      exportedBy: session.username,
      data: result,
    })
  }

  const data = await exporters[entity]()
  return apiSuccess({ entity, count: data.length, data })
}
