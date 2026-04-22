import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// ── GET: Export JSON ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const entity = searchParams.get('entity') || 'all'

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

// ── POST: Import JSON ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  let body: { entity: string; data: any[] }
  try {
    body = await request.json()
  } catch {
    return apiError('Body JSON tidak valid')
  }

  const { entity, data } = body
  if (!entity || !Array.isArray(data)) {
    return apiError('Field "entity" dan "data" (array) wajib diisi')
  }
  if (data.length === 0) return apiError('Data kosong, tidak ada yang diimport')
  if (data.length > 50000) return apiError('Maksimal 50.000 baris per import')

  const importedBy = session.username
  let inserted = 0
  let updated = 0
  let skipped = 0

  try {
    if (entity === 'products') {
      for (const row of data) {
        if (!row.sku) { skipped++; continue }
        const payload = {
          sku: row.sku,
          productName: row.productName ?? row.product_name ?? row.sku,
          categoryId: row.categoryId ?? row.category_id ?? null,
          categoryName: row.categoryName ?? row.category_name ?? null,
          unit: row.unit ?? 'pcs',
          hpp: Number(row.hpp) || 0,
          rop: Number(row.rop) || 0,
          leadTimeDays: Number(row.leadTimeDays ?? row.lead_time_days) || 0,
          stokAwal: Number(row.stokAwal ?? row.stok_awal) || 0,
          isActive: row.isActive ?? row.is_active ?? true,
          createdBy: importedBy,
        }
        const exists = await prisma.masterProduct.findUnique({ where: { sku: row.sku } })
        if (exists) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { sku: _s, createdBy: _c, ...updatePayload } = payload
          await prisma.masterProduct.update({ where: { sku: row.sku }, data: updatePayload })
          updated++
        } else {
          await prisma.masterProduct.create({ data: payload })
          inserted++
        }
      }
    } else if (entity === 'orders') {
      for (const row of data) {
        const orderNo = row.orderNo ?? row.order_no
        if (!orderNo) { skipped++; continue }
        const payload = {
          orderNo,
          status: row.status ?? 'COMPLETED',
          platform: row.platform ?? null,
          airwaybill: row.airwaybill ?? null,
          orderCreatedAt: row.orderCreatedAt ?? row.order_created_at ?? null,
          trxDate: (row.trxDate ?? row.trx_date) ? new Date(row.trxDate ?? row.trx_date) : null,
          sku: row.sku ?? null,
          productName: row.productName ?? row.product_name ?? null,
          qty: Number(row.qty) || 1,
          totalProductPrice: Number(row.totalProductPrice ?? row.total_product_price) || 0,
          realOmzet: Number(row.realOmzet ?? row.real_omzet) || 0,
          city: row.city ?? null,
          province: row.province ?? null,
          buyerUsername: row.buyerUsername ?? row.buyer_username ?? null,
          receiverName: row.receiverName ?? row.receiver_name ?? null,
          phone: row.phone ?? null,
          hpp: Number(row.hpp) || 0,
          createdBy: importedBy,
        }
        const exists = await prisma.order.findFirst({ where: { orderNo } })
        if (exists) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { orderNo: _no, createdBy: _c, ...updatePayload } = payload
          await prisma.order.update({ where: { id: exists.id }, data: updatePayload })
          updated++
        } else {
          await prisma.order.create({ data: payload })
          inserted++
        }
      }
    } else if (entity === 'vendors') {
      for (const row of data) {
        const vendorCode = row.vendorCode ?? row.vendor_code
        if (!vendorCode) { skipped++; continue }
        const payload = {
          vendorCode,
          namaVendor: row.namaVendor ?? row.nama_vendor ?? vendorCode,
          kontak: row.kontak ?? null,
          email: row.email ?? null,
          alamat: row.alamat ?? null,
          rekening: row.rekening ?? null,
          bank: row.bank ?? null,
          termPayment: Number(row.termPayment ?? row.term_payment) || 0,
          isActive: row.isActive ?? row.is_active ?? true,
          createdBy: importedBy,
        }
        const exists = await prisma.vendor.findUnique({ where: { vendorCode } })
        if (exists) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { vendorCode: _vc, createdBy: _c, ...updatePayload } = payload
          await prisma.vendor.update({ where: { vendorCode }, data: updatePayload })
          updated++
        } else {
          await prisma.vendor.create({ data: payload })
          inserted++
        }
      }
    } else if (entity === 'wallet_ledger') {
      for (const row of data) {
        const walletId = row.walletId ?? row.wallet_id
        if (!walletId) { skipped++; continue }
        const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
        if (!wallet) { skipped++; continue }
        if (row.id) {
          const exists = await prisma.walletLedger.findUnique({ where: { id: row.id } })
          if (exists) { skipped++; continue }
        }
        await prisma.walletLedger.create({
          data: {
            walletId,
            trxDate: new Date(row.trxDate ?? row.trx_date),
            trxType: row.trxType ?? row.trx_type,
            category: row.category ?? null,
            amount: Number(row.amount) || 0,
            note: row.note ?? null,
            refOrderNo: row.refOrderNo ?? row.ref_order_no ?? null,
            createdBy: importedBy,
          },
        })
        inserted++
      }
    } else if (entity === 'inventory_ledger') {
      for (const row of data) {
        if (!row.sku) { skipped++; continue }
        const product = await prisma.masterProduct.findUnique({ where: { sku: row.sku } })
        if (!product) { skipped++; continue }
        if (row.id) {
          const exists = await prisma.inventoryLedger.findUnique({ where: { id: row.id } })
          if (exists) { skipped++; continue }
        }
        await prisma.inventoryLedger.create({
          data: {
            sku: row.sku,
            trxDate: new Date(row.trxDate ?? row.trx_date),
            direction: row.direction,
            reason: row.reason,
            qty: Number(row.qty) || 0,
            batchId: row.batchId ?? row.batch_id ?? null,
            note: row.note ?? null,
            createdBy: importedBy,
          },
        })
        inserted++
      }
    } else {
      return apiError(`Import untuk entity "${entity}" belum didukung. Entitas yang bisa diimport: products, orders, vendors, wallet_ledger, inventory_ledger`)
    }
  } catch (err: any) {
    return apiError(`Gagal import: ${err.message}`, 500)
  }

  return apiSuccess({
    entity,
    inserted,
    updated,
    skipped,
    total: data.length,
    importedBy,
    importedAt: new Date().toISOString(),
  })
}
