import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/crm — buyer list aggregated from orders
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') || ''
  const platform = searchParams.get('platform') || ''
  const page = Number(searchParams.get('page') || 1)
  const limit = Number(searchParams.get('limit') || 30)
  const offset = (page - 1) * limit

  try {
    // Build WHERE clause safely using chained Prisma.sql (more reliable than Prisma.join)
    let whereClause = Prisma.sql`
      COALESCE(status, '') NOT ILIKE '%batal%'
      AND COALESCE(status, '') NOT ILIKE '%cancel%'
      AND COALESCE(status, '') NOT ILIKE '%dibatalkan%'
    `

    if (search) {
      whereClause = Prisma.sql`${whereClause} AND (
        receiver_name ILIKE ${'%' + search + '%'}
        OR buyer_username ILIKE ${'%' + search + '%'}
      )`
    }
    if (platform) {
      whereClause = Prisma.sql`${whereClause} AND platform = ${platform}`
    }

    const buyers = await prisma.$queryRaw<any[]>`
      SELECT
        COALESCE(receiver_name, buyer_username, 'Unknown') AS buyer_key,
        MAX(buyer_username) AS buyer_username,
        receiver_name,
        MAX(phone) AS phone,
        MAX(city) AS city,
        MAX(province) AS province,
        MAX(platform) AS platform,
        COUNT(DISTINCT order_no) AS total_orders,
        SUM(real_omzet) AS total_omzet,
        MAX(order_created_at) AS last_order_date,
        MIN(order_created_at) AS first_order_date
      FROM orders
      WHERE ${whereClause}
      GROUP BY receiver_name, buyer_username
      ORDER BY total_orders DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const totalResult = await prisma.$queryRaw<[{ cnt: bigint }]>`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT receiver_name, buyer_username
        FROM orders
        WHERE ${whereClause}
        GROUP BY receiver_name, buyer_username
      ) grouped
    `

    // Debug: jika 0 results, check total orders in DB
    let debugInfo: any = undefined
    if (buyers.length === 0) {
      const totalCheck = await prisma.$queryRaw<[{ total: bigint; platforms: string }]>`
        SELECT
          COUNT(*) AS total,
          STRING_AGG(DISTINCT COALESCE(platform, 'NULL'), ', ') AS platforms
        FROM orders
      `
      const sampleStatuses = await prisma.$queryRaw<any[]>`
        SELECT DISTINCT status, COUNT(*) as cnt
        FROM orders
        GROUP BY status
        ORDER BY cnt DESC
        LIMIT 10
      `
      debugInfo = {
        totalOrdersInDb: Number(totalCheck[0]?.total ?? 0),
        availablePlatforms: totalCheck[0]?.platforms ?? 'none',
        statusDistribution: sampleStatuses.map(s => ({
          status: s.status,
          count: Number(s.cnt),
        })),
        filterUsed: { search, platform },
      }
    }

    return apiSuccess({
      buyers: buyers.map(b => ({
        ...b,
        totalOrders: Number(b.total_orders),
        totalOmzet: Number(b.total_omzet),
      })),
      total: Number(totalResult[0]?.cnt ?? 0),
      ...(debugInfo && { debug: debugInfo }),
    })
  } catch (error: any) {
    console.error('[CRM API Error]', error)
    return apiError(`CRM query gagal: ${error.message || 'Unknown error'}`, 500)
  }
}
