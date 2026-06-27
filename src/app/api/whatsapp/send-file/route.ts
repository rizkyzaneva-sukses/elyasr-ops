import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/whatsapp/send-file — send file via WAHA
// Body: { chatId, caption, fileBase64, fileName, mimeType }
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const body = await request.json()
  const { chatId, caption, fileBase64, fileName, mimeType } = body

  if (!chatId) return apiError('chatId wajib diisi')
  if (!fileBase64) return apiError('File wajib diisi')

  const WAHA_URL = process.env.WAHA_URL
  if (!WAHA_URL) return apiError('WAHA_URL belum dikonfigurasi di environment')

  // Format phone: remove spaces, ensure @c.us suffix
  const formattedChatId = chatId.includes('@c.us') ? chatId : `${chatId.replace(/[^0-9]/g, '')}@c.us`

  try {
    // Send file via WAHA API
    const wahaRes = await fetch(`${WAHA_URL}/api/sendFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: formattedChatId,
        file: {
          mimetype: mimeType || 'application/pdf',
          url: fileBase64.startsWith('data:') ? fileBase64 : `data:${mimeType || 'application/pdf'};base64,${fileBase64}`,
          filename: fileName || 'PO.pdf',
        },
        caption: caption || '',
      }),
    })

    const wahaData = await wahaRes.json()

    if (!wahaRes.ok) {
      return apiError(`WAHA error: ${wahaData.message || JSON.stringify(wahaData)}`, 502)
    }

    return apiSuccess({ message: 'File berhasil dikirim via WhatsApp', waResult: wahaData })
  } catch (err: any) {
    return apiError(`Gagal kirim ke WAHA: ${err.message}`, 502)
  }
}
