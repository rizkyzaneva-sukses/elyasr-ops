import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, generateGRNumber, getPagination } from '@/lib/utils'

// GET /api/procurement/receive — list goods receipts
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const { page, limit, skip, take } = getPagination({
    page: Number(searchParams.get('page')) || 1,
    limit: Number(searchParams.get('limit')) || 20,
  })
  const vendorId = searchParams.get('vendorId') || undefined
  const search = searchParams.get('search') || undefined

  const where: any = {}
  if (vendorId) where.vendorId = vendorId
  if (search) {
    where.OR = [
      { receiptNumber: { contains: search, mode: 'insensitive' } },
      { poNumber: { contains: search, mode: 'insensitive' } },
      { vendorName: { contains: search, mode: 'insensitive' } },
      { suratJalanNumber: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where,
      include: { items: true },
      orderBy: { receiptDate: 'desc' },
      skip,
      take,
    }),
    prisma.goodsReceipt.count({ where }),
  ])

  return apiSuccess({ rows, total, page, limit })
}

// POST /api/procurement/receive — goods receipt (multi-PO support)
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { vendorId, receiptDate, suratJalanNumber, items, note } = body
  // items: [{ poId?, poItemId?, sku, productName, qtyReceived, unitPrice?, note? }]

  if (!vendorId || !items?.length) return apiError('Vendor dan items wajib diisi')

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) return apiError('Vendor tidak ditemukan')

  // Validate all referenced POs exist and belong to this vendor
  const poIdSet = new Set<string>()
  for (const i of items) { if (i.poId) poIdSet.add(i.poId) }
  const poIds = Array.from(poIdSet)
  const pos = poIds.length > 0
    ? await prisma.purchaseOrder.findMany({
        where: { id: { in: poIds } },
        include: { items: true },
      })
    : []

  for (const poId of poIds) {
    const po = pos.find(p => p.id === poId)
    if (!po) return apiError(`PO ${poId} tidak ditemukan`)
    if (po.status === 'CANCELLED') return apiError(`PO ${po.poNumber} sudah dibatalkan`)
    if (po.vendorId !== vendorId) return apiError(`PO ${po.poNumber} bukan milik vendor ini`)
  }

  // Generate receipt number
  const date = new Date(receiptDate || new Date())
  const existingGRNumbers = (await prisma.goodsReceipt.findMany({
    select: { receiptNumber: true },
  })).map(r => r.receiptNumber)
  const receiptNumber = generateGRNumber(date, existingGRNumbers)

  await prisma.$transaction(async (tx) => {
    // Create goods receipt header
    const receipt = await tx.goodsReceipt.create({
      data: {
        receiptNumber,
        poId: poIds.length === 1 ? poIds[0] : null,
        poNumber: poIds.length === 1 ? pos[0]?.poNumber ?? null : null,
        vendorId,
        vendorName: vendor.namaVendor,
        receiptDate: date,
        suratJalanNumber: suratJalanNumber || null,
        itemsJson: items,
        note: note || null,
        createdBy: session.username,
      },
    })

    // Create GoodsReceiptItem for each item + update PO items + inventory ledger
    const affectedPOIds = new Set<string>()

    for (const item of items) {
      // Create receipt item
      await tx.goodsReceiptItem.create({
        data: {
          receiptId: receipt.id,
          poId: item.poId || null,
          poItemId: item.poItemId || null,
          sku: item.sku,
          productName: item.productName,
          qtyReceived: item.qtyReceived,
          unitPrice: item.unitPrice || 0,
          note: item.note || null,
        },
      })

      // Update PO item if linked to a PO
      if (item.poId && item.poItemId) {
        affectedPOIds.add(item.poId)

        const poItem = await tx.purchaseOrderItem.findUnique({
          where: { id: item.poItemId },
        })
        if (poItem) {
          const newQtyReceived = poItem.qtyReceived + item.qtyReceived
          const itemStatus = newQtyReceived >= poItem.qtyOrder ? 'COMPLETED' : 'PARTIAL'

          await tx.purchaseOrderItem.update({
            where: { id: item.poItemId },
            data: { qtyReceived: newQtyReceived, status: itemStatus },
          })
        }
      }

      // Create inventory ledger entry
      await tx.inventoryLedger.create({
        data: {
          sku: item.sku,
          trxDate: date,
          direction: 'IN',
          reason: 'PURCHASE',
          qty: item.qtyReceived,
          note: `GR ${receiptNumber}${item.poId ? ` (PO ${pos.find(p => p.id === item.poId)?.poNumber || '-'})` : ' (tanpa PO)'}`,
          createdBy: session.username,
        },
      })
    }

    // Update PO status for each affected PO
    for (const poId of affectedPOIds) {
      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { poId } })
      const anyReceived = updatedItems.some(i => i.qtyReceived > 0)
      const allCompleted = updatedItems.every(i => i.status === 'COMPLETED')
      const poStatus = allCompleted ? 'COMPLETED' : anyReceived ? 'PARTIAL' : 'OPEN'
      const totalQtyReceived = updatedItems.reduce((sum, i) => sum + i.qtyReceived, 0)

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: poStatus, totalQtyReceived },
      })
    }

    await tx.auditLog.create({
      data: {
        entityType: 'GoodsReceipt',
        action: 'CREATE',
        entityId: receipt.id,
        afterJson: { receiptNumber, vendorId, poIds: poIds as string[], items: items.map((i: any) => ({ sku: i.sku, qty: i.qtyReceived })) },
        performedBy: session.username,
      },
    })
  })

  return apiSuccess({ message: 'Penerimaan barang berhasil dicatat', receiptNumber }, 201)
}
