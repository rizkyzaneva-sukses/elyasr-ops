import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const vendor = await prisma.vendor.update({
    where: { id: params.id },
    data: {
      namaVendor: body.namaVendor,
      kontak: body.kontak,
      email: body.email,
      alamat: body.alamat,
      rekening: body.rekening,
      bank: body.bank,
      termPayment: body.termPayment || 0,
      isActive: body.isActive ?? true,
    },
  })
  return apiSuccess(vendor)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  await prisma.vendor.update({ where: { id: params.id }, data: { isActive: false } })
  return apiSuccess({ message: 'Vendor dinonaktifkan' })
}
