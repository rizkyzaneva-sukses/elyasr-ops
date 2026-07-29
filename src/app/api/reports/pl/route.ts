import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import { getReturnRatioByOrderNo } from '@/lib/pnl-helpers'

// GET /api/reports/pl?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom')
  const dateTo   = searchParams.get('dateTo')
  if (!dateFrom || !dateTo) return apiError('dateFrom dan dateTo wajib diisi')

  const fromDate = new Date(dateFrom)
  const toDate   = new Date(dateTo)
  toDate.setHours(23, 59, 59, 999)

  // ── 1. Payout — basis tanggal cair (releasedDate) ──────────────────────
  // Order yang sudah RETUR dikeluarkan dari Pencairan meski data Payout mentah
  // dari marketplace masih menunjukkan nilai penuh. Proporsional per orderNo
  // karena satu orderNo bisa multi-SKU dan hanya sebagian yang di-retur.
  const payoutsInPeriod = await prisma.payout.findMany({
    where: { releasedDate: { gte: fromDate, lte: toDate } },
    select: {
      orderNo:          true,
      source:           true,
      totalIncome:      true,
      omzet:            true,
      platformFee:      true,
      amsFee:           true,
      platformFeeOther: true,
      bebanOngkir:      true,
    },
  })
  const returnRatioMap = await getReturnRatioByOrderNo(payoutsInPeriod.map(p => p.orderNo))

  let pencairanBersih = 0   // SUM(totalIncome) — actual cash masuk, porsi retur dikeluarkan
  let omzetKotor      = 0   // SUM(omzet) — gross sebelum fee, porsi retur dikeluarkan
  let feeShopee       = 0
  let feeTikTok       = 0
  let feeAms          = 0
  let feeLainnya      = 0
  let bebanKerugianTikTok = 0

  for (const p of payoutsInPeriod) {
    const keepRatio = 1 - (returnRatioMap.get(p.orderNo) ?? 0)
    pencairanBersih += (p.totalIncome ?? 0) * keepRatio
    omzetKotor      += (p.omzet ?? 0) * keepRatio
    feeAms          += p.amsFee ?? 0
    feeLainnya      += p.platformFeeOther ?? 0
    if (p.source === 'shopee_income') {
      feeShopee += p.platformFee ?? 0
    } else {
      feeTikTok += p.platformFee ?? 0
      bebanKerugianTikTok += p.bebanOngkir ?? 0
    }
  }
  pencairanBersih = Math.round(pencairanBersih)
  omzetKotor      = Math.round(omzetKotor)
  const totalFee = feeShopee + feeTikTok + feeAms + feeLainnya

  // ── 2. HPP — dari Order yang payoutnya cair di periode ini ──
  // Join manual berdasarkan orderNo (bukan relasi payout.orderId): satu order
  // bisa multi-SKU per orderNo, sedangkan Payout.orderId hanya ke-assign ke
  // satu row saja saat import, jadi relasi payout.releasedDate melewatkan
  // sebagian row dan membuat HPP undercount dibanding pencairanBersih.
  // Order.hpp di-set saat upload order CSV (lookup dari masterProduct saat itu).
  // Order berstatus RETUR dikeluarkan — barangnya sudah kembali ke stok.
  const paidOrderNos = payoutsInPeriod.map(p => p.orderNo)

  const paidOrders = await prisma.order.findMany({
    where: {
      sku: { not: null },
      orderNo: { in: paidOrderNos },
      NOT: [
        { status: { contains: 'retur', mode: 'insensitive' } },
        { status: { contains: 'return', mode: 'insensitive' } },
        { status: { contains: 'dikembalikan', mode: 'insensitive' } },
      ],
    },
    select: { sku: true, qty: true, hpp: true },
  })

  // Hitung juga totalOrdersPaid dari payout (untuk info hint)
  const payoutCount = await prisma.payout.count({
    where: { releasedDate: { gte: fromDate, lte: toDate }, omzet: { gt: 0 } },
  })

  let hpp = 0
  const ordersFound = paidOrders.length
  for (const order of paidOrders) {
    hpp += (order.hpp ?? 0) * (order.qty ?? 1)
  }

  // ── 3. Laba Kotor (Pencairan Bersih - HPP) ──────────────────────────────
  const labaKotor = pencairanBersih - hpp

  // ── 4. Beban Operasional (EXPENSE) per kategori ─────────────────────────
  // Exclude vendor payment: entry lama pakai EXPENSE+category 'Bayar Vendor%',
  // entry baru pakai trxType VENDOR_PAYMENT. Keduanya jadi info saja di bawah.
  const expenses = await prisma.walletLedger.groupBy({
    by: ['category'],
    where: {
      trxType: 'EXPENSE',
      trxDate: { gte: fromDate, lte: toDate },
      NOT: { category: { startsWith: 'Bayar Vendor' } },
    },
    _sum: { amount: true },
  })

  let bebanOperasional = 0
  const expenseGroups: { group: string; amount: number }[] = expenses.map(e => {
    const amt = Math.abs(e._sum.amount || 0)
    bebanOperasional += amt
    return { group: e.category || 'Lain-lain', amount: amt }
  })

  // ── 4b. Info Bayar Vendor (tidak masuk P&L, informasi saja) ─────────────
  const vendorPayAgg = await prisma.walletLedger.aggregate({
    where: {
      trxDate: { gte: fromDate, lte: toDate },
      OR: [
        { trxType: 'VENDOR_PAYMENT' },
        { trxType: 'EXPENSE', category: { startsWith: 'Bayar Vendor' } },
      ],
    },
    _sum: { amount: true },
  })
  const totalBayarVendor = Math.abs(vendorPayAgg._sum.amount ?? 0)

  // ── 5. Beban Penyusutan Aset Tetap ───────────────────────────────────────
  const asets = await prisma.asetTetap.findMany({ where: { isActive: true } })
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375
  let totalBebanPenyusutan = 0

  for (const aset of asets) {
    const penyusutanPerBulan = aset.nilaiPerolehan / (aset.umurEkonomisThn * 12)
    const asetStart = aset.tanggalBeli > fromDate ? aset.tanggalBeli : fromDate
    if (asetStart > toDate) continue
    const bulanSampaiFullyDep = aset.umurEkonomisThn * 12
    const bulanSejakBeli = (fromDate.getTime() - aset.tanggalBeli.getTime()) / msPerMonth
    if (bulanSejakBeli >= bulanSampaiFullyDep) continue
    const bulanDalamRange = Math.max(0, (toDate.getTime() - asetStart.getTime()) / msPerMonth)
    const bulanEfektif = Math.min(bulanDalamRange, bulanSampaiFullyDep - Math.max(0, bulanSejakBeli))
    totalBebanPenyusutan += Math.round(penyusutanPerBulan * bulanEfektif)
  }

  if (totalBebanPenyusutan > 0) {
    bebanOperasional += totalBebanPenyusutan
    expenseGroups.push({ group: 'Penyusutan Aset Tetap', amount: totalBebanPenyusutan })
  }

  // ── 6. Pendapatan Lain ───────────────────────────────────────────────────
  const otherIncomes = await prisma.walletLedger.aggregate({
    where: { trxType: 'OTHER_INCOME', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const otherIncome = otherIncomes._sum.amount || 0

  // ── 7. Laba ──────────────────────────────────────────────────────────────
  const labaBersihOperasional = labaKotor - bebanOperasional
  const labaBersih            = labaBersihOperasional + otherIncome

  return apiSuccess({
    // Basis utama — cash masuk bersih
    pencairanBersih,
    // Info saja — tidak ikut mengurangi laba (sudah ter-net di pencairanBersih)
    omzetKotor,
    totalFee,
    feePlatformDetail: { feeShopee, feeTikTok, feeAms, feeLainnya },
    // HPP dari order yang dicairkan periode ini
    hpp,
    labaKotor,
    // Beban
    bebanOperasional,
    expenseGroups,
    // Laba
    labaBersihOperasional,
    otherIncome,
    labaBersih,
    // Info tambahan
    bebanKerugianTikTok,
    totalOrdersPaid: payoutCount,
    ordersFound,
    totalBayarVendor,   // info saja, tidak mengurangi laba
  })
}
