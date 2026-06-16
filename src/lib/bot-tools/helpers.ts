// ─────────────────────────────────────────────
// Helper: Rentang waktu WIB (Asia/Jakarta)
// Menggunakan date-fns-tz untuk timezone handling yang robust
// ─────────────────────────────────────────────
import { toZonedTime, format as formatTz } from 'date-fns-tz'
import { subDays, startOfMonth } from 'date-fns'

export const WIB = 'Asia/Jakarta'

export type Period = 'today' | 'yesterday' | 'week' | 'month'

export interface DateRangeResult {
    gte: Date
    lte: Date
    label: string
}

/** Dapatkan "hari ini" dalam zona WIB */
function todayWIB(): Date {
    return toZonedTime(new Date(), WIB)
}

function formatDateStr(d: Date): string {
    return formatTz(d, 'yyyy-MM-dd', { timeZone: WIB })
}

export function getDateRange(period: Period): DateRangeResult {
    const now = todayWIB()
    const todayStr = formatDateStr(now)

    if (period === 'today') {
        return {
            gte: new Date(todayStr + 'T00:00:00+07:00'),
            lte: new Date(todayStr + 'T23:59:59+07:00'),
            label: 'Hari Ini',
        }
    }
    if (period === 'yesterday') {
        const prev = subDays(now, 1)
        const prevStr = formatDateStr(prev)
        return {
            gte: new Date(prevStr + 'T00:00:00+07:00'),
            lte: new Date(prevStr + 'T23:59:59+07:00'),
            label: 'Kemarin',
        }
    }
    if (period === 'week') {
        const weekAgo = subDays(now, 6)
        return {
            gte: new Date(formatDateStr(weekAgo) + 'T00:00:00+07:00'),
            lte: new Date(todayStr + 'T23:59:59+07:00'),
            label: '7 Hari Terakhir',
        }
    }
    // month
    const monthStart = startOfMonth(now)
    return {
        gte: new Date(formatDateStr(monthStart) + 'T00:00:00+07:00'),
        lte: new Date(todayStr + 'T23:59:59+07:00'),
        label: 'Bulan Ini',
    }
}

export function fmtWIBDate(d: Date): string {
    return formatTz(d, 'd MMM yyyy', { timeZone: WIB })
}

export function getCustomDateRange(startDate: string, endDate?: string): DateRangeResult {
    const gte = new Date(startDate + 'T00:00:00+07:00')
    const lteStr = endDate || startDate
    const lte = new Date(lteStr + 'T23:59:59+07:00')
    const label = endDate && endDate !== startDate
        ? `${fmtWIBDate(gte)} – ${fmtWIBDate(lte)}`
        : fmtWIBDate(gte)
    return { gte, lte, label }
}

export function resolveRange(period?: string, startDate?: string, endDate?: string): DateRangeResult {
    if (startDate) return getCustomDateRange(startDate, endDate)
    return getDateRange((period || 'today') as Period)
}

export function formatRp(n: number) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
