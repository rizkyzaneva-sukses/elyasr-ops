/** GET /api/telegram/adye-models?secret=565228988 — cek model list dari AI provider */
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.TELEGRAM_OWNER_CHAT_ID) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.ADYE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ADYE_API_KEY tidak ada' })
    const baseUrl = process.env.ADYE_BASE_URL || 'https://antigravity.u9uhfo.easypanel.host/v1'

    const res = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const text = await res.text()
    try {
        const data = JSON.parse(text)
        return NextResponse.json({ status: res.status, models: data, baseUrl })
    } catch {
        return NextResponse.json({ status: res.status, error: 'AI provider response bukan JSON', raw: text.slice(0, 500), baseUrl })
    }
}
