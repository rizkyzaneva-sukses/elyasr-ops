import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// Waktu Jakarta (WIB)
function nowJakarta(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
}


// POST /api/scan/[id]/commit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const batch = await prisma.inventoryScanBatch.findUnique({ where: { id: (await params).id } })
  if (!batch) return apiError('Batch tidak ditemukan', 404)
  if (batch.status !== 'DRAFT') return apiError('Batch sudah diproses')

  const items = batch.itemsJson as Record<string, number>
  if (!items || Object.keys(items).length === 0) return apiError('Batch kosong')

  // Validate all SKUs exist
  const skus = Object.keys(items)
  const products = await prisma.masterProduct.findMany({ where: { sku: { in: skus } } })
  const foundSkus = new Set(products.map(p => p.sku))
  const missing = skus.filter(s => !foundSkus.has(s))
  if (missing.length > 0) return apiError(`SKU tidak ditemukan: ${missing.join(', ')}`)

  // Create ledger entries + commit batch in transaction
  await prisma.$transaction(async (tx) => {
    // Create ledger entries
    await tx.inventoryLedger.createMany({
      data: skus.map(sku => ({
        sku,
        trxDate: batch.batchDate,
        direction: batch.direction,
        reason: (batch.reason as any) || 'ADJUSTMENT',
        qty: items[sku],
        batchId: batch.id,
        createdBy: session.username,
      })),
    })

    // Mark batch as committed
    await tx.inventoryScanBatch.update({
      where: { id: batch.id },
      data: { status: 'COMMITTED' },
    })

    // Audit log
    await tx.auditLog.create({
      data: {
        entityType: 'InventoryScanBatch',
        action: 'COMMIT',
        entityId: batch.id,
        afterJson: { items, direction: batch.direction, reason: batch.reason },
        performedBy: session.username,
      },
    })
  })

  return apiSuccess({ message: 'Batch berhasil dicommit', batchId: batch.id })
}
