import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return apiError('Username dan password wajib diisi', 400)
    }

    // Find user
    const user = await prisma.appUser.findUnique({
      where: { username: username.trim().toLowerCase() },
    })

    if (!user) {
      return apiError('Username atau password salah', 401)
    }

    if (!user.isActive) {
      return apiError('Akun tidak aktif. Hubungi administrator.', 403)
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return apiError('Username atau password salah', 401)
    }

    // Create session
    const cookieStore = await cookies()
    const response = apiSuccess({
      username: user.username,
      userRole: user.userRole,
      fullName: user.fullName,
      redirectTo: user.userRole === 'EXTERNAL' ? '/external-inventory' : '/dashboard',
    })

    const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
    session.userId = user.id
    session.username = user.username
    session.userRole = user.userRole as SessionData['userRole']
    session.fullName = user.fullName
    session.isLoggedIn = true
    await session.save()

    return response
  } catch (err) {
    console.error('[AUTH] Login error:', err)
    return apiError('Terjadi kesalahan sistem', 500)
  }
}
