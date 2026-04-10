import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const product = await prisma.masterProduct.findUnique({
    where: { id: (await params).id },
    include: { category: true },
  })
  if (!product) return apiError('Produk tidak ditemukan', 404)
  return apiSuccess(product)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { productName, categoryId, unit, hpp, rop, leadTimeDays, isActive, variantInfo } = body

  let categoryName: string | null = null
  if (categoryId) {
    const cat = await prisma.productCategory.findUnique({ where: { id: categoryId } })
    categoryName = cat?.categoryName ?? null
  }

  const product = await prisma.masterProduct.update({
    where: { id: (await params).id },
    data: {
      productName,
      categoryId: categoryId || null,
      categoryName,
      unit,
      hpp: Number(hpp),
      rop: Number(rop),
      leadTimeDays: Number(leadTimeDays),
      isActive,
      variantInfo: variantInfo || null,
    },
  })

  return apiSuccess(product)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  // Soft delete
  const product = await prisma.masterProduct.update({
    where: { id: (await params).id },
    data: { isActive: false },
  })
  return apiSuccess(product)
}
