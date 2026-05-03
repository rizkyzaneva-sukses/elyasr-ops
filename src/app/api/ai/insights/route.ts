import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// ── Helper: format rupiah ──
function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

// ── Kumpulkan data performa untuk dikirim ke Gemini ──
async function collectPerformanceData() {
  const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))

  // 30 hari terakhir
  const last30Start = new Date(nowWIB)
  last30Start.setDate(last30Start.getDate() - 30)
  const gte30 = new Date(last30Start.toISOString().slice(0, 10) + 'T00:00:00+07:00')
  const lte30 = new Date(nowWIB.toISOString().slice(0, 10) + 'T23:59:59+07:00')

  // Bulan ini
  const monthStart = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), 1)
  const gteMonth   = new Date(monthStart.toISOString().slice(0, 10) + 'T00:00:00+07:00')

  const [omzet30, omzetByPlatform, agingBacklog, stokKritis, topProvinces, payoutStats, dailyTrend] = await Promise.all([

    // Omzet & GP 30 hari
    prisma.$queryRaw<{ total_omzet: bigint; total_hpp: bigint; cnt: bigint }[]>`
      SELECT
        COALESCE(SUM(real_omzet), 0) AS total_omzet,
        COALESCE(SUM(hpp * qty), 0) AS total_hpp,
        COUNT(*) AS cnt
      FROM orders
      WHERE trx_date >= ${gte30} AND trx_date <= ${lte30}
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
    `,

    // Per platform 30 hari
    prisma.$queryRaw<{ platform: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint }[]>`
      SELECT
        COALESCE(platform, 'Unknown') AS platform,
        COUNT(*) AS cnt,
        COALESCE(SUM(real_omzet), 0) AS total_omzet,
        COALESCE(SUM(hpp * qty), 0) AS total_hpp
      FROM orders
      WHERE trx_date >= ${gte30} AND trx_date <= ${lte30}
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
      GROUP BY platform ORDER BY total_omzet DESC
    `,

    // Aging backlog saat ini
    prisma.$queryRaw<{ bucket: string; cnt: bigint }[]>`
      SELECT
        CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 12 THEN '0-12 Jam'
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 24 THEN '12-24 Jam'
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 48 THEN '24-48 Jam'
          ELSE '>48 Jam'
        END AS bucket,
        COUNT(*) AS cnt
      FROM orders
      WHERE status NOT LIKE 'TERKIRIM%'
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
      GROUP BY bucket
    `,

    // Stok kritis
    prisma.$queryRaw<{ cnt: bigint; skus: string }[]>`
      SELECT COUNT(*) AS cnt, STRING_AGG(sku, ', ') AS skus
      FROM (
        SELECT p.sku,
          p.stok_awal
          + COALESCE(SUM(CASE WHEN l.direction = 'IN' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          AS soh, p.rop
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.stok_awal, p.rop, p.last_opname_date
      ) x WHERE soh <= rop
    `,

    // Top 5 provinsi 30 hari
    prisma.$queryRaw<{ province: string; cnt: bigint }[]>`
      SELECT province, COUNT(*) AS cnt
      FROM orders
      WHERE province IS NOT NULL AND trx_date >= ${gte30} AND trx_date <= ${lte30}
      GROUP BY province ORDER BY cnt DESC LIMIT 5
    `,

    // Payout bulan ini
    prisma.payout.aggregate({
      where: { releasedDate: { gte: gteMonth } },
      _sum: { totalIncome: true },
      _count: { id: true },
    }),

    // Trend harian 7 hari terakhir
    prisma.$queryRaw<{ day: string; cnt: bigint; omzet: bigint }[]>`
      SELECT
        TO_CHAR(trx_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
        COUNT(*) AS cnt,
        COALESCE(SUM(real_omzet), 0) AS omzet
      FROM orders
      WHERE trx_date >= ${new Date(new Date(nowWIB).setDate(nowWIB.getDate() - 7))}
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
      GROUP BY day ORDER BY day
    `,
  ])

  const o30 = (omzet30 as any[])[0]
  const totalOmzet = Number(o30?.total_omzet ?? 0)
  const totalHpp   = Number(o30?.total_hpp ?? 0)
  const totalOrder = Number(o30?.cnt ?? 0)
  const gp         = totalOmzet - totalHpp
  const margin     = totalOmzet > 0 ? ((gp / totalOmzet) * 100).toFixed(1) : '0'
  const agingMap   = Object.fromEntries((agingBacklog as any[]).map((r: any) => [r.bucket, Number(r.cnt)]))
  const agingTotal = (Object.values(agingMap) as number[]).reduce((s, v) => s + v, 0)

  return {
    nowWIB: nowWIB.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' }),
    omzet30: totalOmzet,
    hpp30: totalHpp,
    gp30: gp,
    margin30: margin,
    orderCount30: totalOrder,
    avgOrderPerDay: totalOrder > 0 ? (totalOrder / 30).toFixed(1) : '0',
    byPlatform: (omzetByPlatform as any[]).map(p => ({
      platform: p.platform,
      count: Number(p.cnt),
      omzet: Number(p.total_omzet),
      gp: Number(p.total_omzet) - Number(p.total_hpp),
      margin: Number(p.total_omzet) > 0
        ? (((Number(p.total_omzet) - Number(p.total_hpp)) / Number(p.total_omzet)) * 100).toFixed(1) : '0',
    })),
    agingBacklog: { total: agingTotal, ...agingMap },
    stokKritis: Number((stokKritis as any[])[0]?.cnt ?? 0),
    topProvinces: (topProvinces as any[]).map(p => ({ province: p.province, count: Number(p.cnt) })),
    payoutBulanIni: {
      count: payoutStats._count.id,
      totalCair: payoutStats._sum.totalIncome ?? 0,
    },
    dailyTrend: (dailyTrend as any[]).map(d => ({
      day: d.day, count: Number(d.cnt), omzet: Number(d.omzet),
    })),
  }
}

// ── Build prompt untuk AI ──
function buildPrompt(data: ReturnType<typeof collectPerformanceData> extends Promise<infer T> ? T : never) {
  const platformLines = data.byPlatform.map(p =>
    `  - ${p.platform}: ${p.count} order, Omzet ${fmt(p.omzet)}, GP ${fmt(p.gp)} (margin ${p.margin}%)`
  ).join('\n')

  const provinceLines = data.topProvinces.map((p, i) =>
    `  ${i + 1}. ${p.province}: ${p.count} order`
  ).join('\n')

  const dailyLines = data.dailyTrend.map(d =>
    `  ${d.day}: ${d.count} order — ${fmt(d.omzet)}`
  ).join('\n')

  return `Kamu adalah analis bisnis senior yang memahami e-commerce Indonesia.
Berikut data performa toko Elyasr per ${data.nowWIB}:

## DATA 30 HARI TERAKHIR
- Total Omzet    : ${fmt(data.omzet30)}
- Total HPP      : ${fmt(data.hpp30)}
- Gross Profit   : ${fmt(data.gp30)} (margin ${data.margin30}%)
- Total Order    : ${data.orderCount30} order
- Rata-rata/hari : ${data.avgOrderPerDay} order/hari

## PER PLATFORM
${platformLines}

## AGING BACKLOG (order belum dikirim saat ini)
- Total pending: ${data.agingBacklog.total} order
- 0-12 Jam     : ${data.agingBacklog['0-12 Jam'] ?? 0}
- 12-24 Jam    : ${data.agingBacklog['12-24 Jam'] ?? 0}
- 24-48 Jam    : ${data.agingBacklog['24-48 Jam'] ?? 0}
- >48 Jam      : ${data.agingBacklog['>48 Jam'] ?? 0} ⚠️

## STOK KRITIS
- ${data.stokKritis} SKU di bawah Reorder Point (ROP)

## TOP PROVINSI (30 hari)
${provinceLines}

## PAYOUT BULAN INI
- ${data.payoutBulanIni.count} order cair — Total: ${fmt(Number(data.payoutBulanIni.totalCair))}

## TREND HARIAN (7 hari terakhir)
${dailyLines}

---
Berdasarkan data di atas, buatlah laporan analisis bisnis yang:
1. Dimulai dengan RINGKASAN EKSEKUTIF (2-3 kalimat padat tentang kondisi bisnis saat ini)
2. Lanjutkan dengan bagian ⚠️ PERHATIAN & RISIKO (poin-poin yang perlu segera ditangani, max 5 poin)
3. Lanjutkan dengan bagian ✅ REKOMENDASI AKSI (saran konkret dan actionable, max 5 poin, urutkan dari yang paling mendesak)
4. Akhiri dengan bagian 💡 PELUANG & INSIGHT (hal menarik dari data yang bisa dimanfaatkan)

Format output: gunakan emoji, poin-poin jelas, bahasa Indonesia yang natural tapi profesional.
Jangan terlalu panjang — Owner ingin baca cepat di handphone.`
}

// ── POST: Generate insights baru ──
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Hanya Owner yang bisa generate AI Insights', 403)

  const apiKey = process.env.SUMOPOD_API_KEY
  if (!apiKey) return apiError('SUMOPOD_API_KEY belum di-set di environment', 500)

  const MODEL = 'MiniMax-M2.7-highspeed'

  try {
    const data = await collectPerformanceData()
    const prompt = buildPrompt(data)

    // Call SumoPod API (OpenAI-compatible)
    const aiRes = await fetch('https://ai.sumopod.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      return apiError(`SumoPod API error: ${errText}`, 500)
    }

    const aiJson = await aiRes.json()
    const content = aiJson?.choices?.[0]?.message?.content ?? 'Tidak ada respons dari AI.'

    // Simpan ke DB
    const nowWIB  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const period  = nowWIB.toISOString().slice(0, 7) // YYYY-MM
    const insight = await prisma.aiInsight.create({
      data: {
        period,
        periodType: 'monthly',
        content,
        modelUsed: MODEL,
        generatedBy: session.username,
        dataSnapshot: data as any,
      },
    })

    return apiSuccess({ id: insight.id, content, generatedAt: insight.createdAt, data })
  } catch (err: any) {
    return apiError(err.message || 'Gagal generate insights', 500)
  }
}

// ── GET: Ambil insight terakhir ──
export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Hanya Owner', 403)

  const latest = await prisma.aiInsight.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, content: true, period: true, modelUsed: true, generatedBy: true, dataSnapshot: true },
  })

  return apiSuccess({ insight: latest })
}
