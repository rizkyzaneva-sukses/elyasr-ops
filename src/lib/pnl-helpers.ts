import { prisma } from './prisma'

const RETUR_REGEX = /retur|return|dikembalikan/i

/**
 * Porsi retur (0..1) per orderNo, proporsional terhadap realOmzet.
 * Satu orderNo bisa multi-SKU (banyak Order row), jadi retur dihitung
 * proporsional — bukan all-or-nothing — saat hanya sebagian SKU yang di-retur.
 */
export async function getReturnRatioByOrderNo(orderNos: string[]): Promise<Map<string, number>> {
  const ratios = new Map<string, number>()
  const uniqueOrderNos = [...new Set(orderNos)]
  if (uniqueOrderNos.length === 0) return ratios

  const rows = await prisma.order.findMany({
    where: { orderNo: { in: uniqueOrderNos } },
    select: { orderNo: true, realOmzet: true, status: true },
  })

  const agg = new Map<string, { total: number; returned: number }>()
  for (const o of rows) {
    const a = agg.get(o.orderNo) ?? { total: 0, returned: 0 }
    a.total += o.realOmzet ?? 0
    if (RETUR_REGEX.test(o.status ?? '')) a.returned += o.realOmzet ?? 0
    agg.set(o.orderNo, a)
  }

  for (const [orderNo, a] of agg) {
    ratios.set(orderNo, a.total > 0 ? Math.min(1, a.returned / a.total) : 0)
  }
  return ratios
}
