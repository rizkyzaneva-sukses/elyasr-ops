import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
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

  // Aggregate buyer data from orders
  const buyers = await prisma.$queryRaw<any[]>`
    SELECT
      COALESCE(buyer_username, receiver_name, 'Unknown') AS buyer_key,
      buyer_username,
      MAX(receiver_name) AS receiver_name,
      MAX(phone) AS phone,
      MAX(city) AS city,
      MAX(province) AS province,
      MAX(platform) AS platform,
      COUNT(DISTINCT order_no) AS total_orders,
      SUM(real_omzet) AS total_omzet,
      MAX(order_created_at) AS last_order_date,
      MIN(order_created_at) AS first_order_date
    FROM orders
    WHERE status NOT ILIKE '%batal%'
      AND status NOT ILIKE '%cancel%'
      AND status NOT ILIKE '%dibatalkan%'
      ${search ? prisma.$queryRaw`AND (buyer_username ILIKE ${'%' + search + '%'} OR receiver_name ILIKE ${'%' + search + '%'})` : prisma.$queryRaw``}
      ${platform ? prisma.$queryRaw`AND platform = ${platform}` : prisma.$queryRaw``}
    GROUP BY COALESCE(buyer_username, receiver_name, 'Unknown'), buyer_username
    ORDER BY total_orders DESC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `

  const totalResult = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(DISTINCT COALESCE(buyer_username, receiver_name, 'Unknown')) AS cnt
    FROM orders
    WHERE status NOT ILIKE '%batal%'
      AND status NOT ILIKE '%cancel%'
  `

  return apiSuccess({
    buyers: buyers.map(b => ({
      ...b,
      totalOrders: Number(b.total_orders),
      totalOmzet: Number(b.total_omzet),
    })),
    total: Number(totalResult[0]?.cnt ?? 0),
  })
}
