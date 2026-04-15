import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * DELETE /api/payouts/reset-all
 * Hapus SEMUA data payout + wallet ledger bertipe PAYOUT.
 * HANYA OWNER. Kirim { confirm: "YES_DELETE_ALL" } untuk konfirmasi.
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden — hanya OWNER', 403)

  const body = await request.json().catch(() => ({}))
  if (body?.confirm !== 'YES_DELETE_ALL') {
    return apiError('Konfirmasi tidak valid. Kirim { confirm: "YES_DELETE_ALL" }', 400)
  }

  // Hitung dulu berapa yang akan dihapus
  const [payoutCount, ledgerCount] = await Promise.all([
    prisma.payout.count(),
    prisma.walletLedger.count({ where: { trxType: 'PAYOUT' } }),
  ])

  // Hapus dalam transaksi
  await prisma.$transaction([
    prisma.walletLedger.deleteMany({ where: { trxType: 'PAYOUT' } }),
    prisma.payout.deleteMany({}),
    // Reset trxDate orders ke null agar bersih sebelum re-import
    prisma.order.updateMany({ where: { trxDate: { not: null } }, data: { trxDate: null } }),
  ])

  return apiSuccess({
    message: `Reset selesai: ${payoutCount} payout dan ${ledgerCount} wallet ledger dihapus. trxDate orders di-reset.`,
    deleted: { payouts: payoutCount, ledgerEntries: ledgerCount },
  })
}
