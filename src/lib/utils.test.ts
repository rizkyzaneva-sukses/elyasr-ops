import { describe, it, expect } from 'vitest'
import {
  formatRupiah,
  formatDate,
  getPagination,
  calculateSOH,
  safeInt,
  safeFloat,
  type LedgerEntry,
} from '@/lib/utils'

// ── formatRupiah ────────────────────────────────────────

describe('formatRupiah', () => {
  it('formats a positive number to IDR currency', () => {
    const result = formatRupiah(150000)
    expect(result).toContain('150.000')
    expect(result).toContain('Rp')
  })

  it('formats zero', () => {
    const result = formatRupiah(0)
    expect(result).toContain('0')
    expect(result).toContain('Rp')
  })

  it('formats negative numbers', () => {
    const result = formatRupiah(-5000)
    expect(result).toContain('5.000')
    expect(result).toContain('Rp')
  })

  it('formats large numbers with proper grouping', () => {
    const result = formatRupiah(172000000)
    expect(result).toContain('172.000.000')
  })

  it('rounds decimal amounts to integer', () => {
    const result = formatRupiah(150000.7)
    expect(result).toContain('150.001')
  })

  it('accepts short parameter without changing output', () => {
    const full = formatRupiah(150000, false)
    const short = formatRupiah(150000, true)
    // Both should produce the same output (short mode is disabled)
    expect(short).toBe(full)
  })
})

// ── formatDate ──────────────────────────────────────────

describe('formatDate', () => {
  const fixedDate = new Date('2026-06-15T10:00:00+07:00')

  it('returns "-" for null', () => {
    expect(formatDate(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatDate(undefined)).toBe('-')
  })

  it('returns "-" for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('-')
  })

  it('formats in short format by default', () => {
    const result = formatDate(fixedDate)
    expect(result).toContain('15')
    expect(result).toContain('Jun')
    expect(result).toContain('2026')
  })

  it('formats in short format explicitly', () => {
    const result = formatDate(fixedDate, 'short')
    expect(result).toContain('15')
    expect(result).toContain('Jun')
    expect(result).toContain('2026')
  })

  it('formats in long format', () => {
    const result = formatDate(fixedDate, 'long')
    expect(result).toContain('15')
    expect(result).toContain('Juni')
    expect(result).toContain('2026')
  })

  it('formats in datetime format', () => {
    const result = formatDate(fixedDate, 'datetime')
    expect(result).toContain('15')
    expect(result).toContain('Jun')
    expect(result).toContain('2026')
  })

  it('parses date strings', () => {
    const result = formatDate('2026-01-01T00:00:00Z', 'short')
    expect(result).toContain('2026')
  })
})

// ── getPagination ───────────────────────────────────────

describe('getPagination', () => {
  it('returns defaults when no params provided', () => {
    const result = getPagination({})
    expect(result).toEqual({ page: 1, limit: 20, skip: 0, take: 20 })
  })

  it('returns defaults when page and limit are undefined', () => {
    const result = getPagination({ page: undefined, limit: undefined })
    expect(result).toEqual({ page: 1, limit: 20, skip: 0, take: 20 })
  })

  it('calculates skip for page 1', () => {
    const result = getPagination({ page: 1, limit: 10 })
    expect(result.skip).toBe(0)
    expect(result.take).toBe(10)
  })

  it('calculates skip for page 3', () => {
    const result = getPagination({ page: 3, limit: 10 })
    expect(result).toEqual({ page: 3, limit: 10, skip: 20, take: 10 })
  })

  it('clamps page to minimum 1', () => {
    const result = getPagination({ page: -5, limit: 10 })
    expect(result.page).toBe(1)
  })

  it('clamps page 0 to 1', () => {
    const result = getPagination({ page: 0 })
    expect(result.page).toBe(1)
  })

  it('clamps limit to minimum 1', () => {
    const result = getPagination({ page: 1, limit: -10 })
    expect(result.limit).toBe(1)
  })

  it('clamps limit to maximum 100', () => {
    const result = getPagination({ page: 1, limit: 500 })
    expect(result.limit).toBe(100)
    expect(result.take).toBe(100)
  })

  it('handles limit of exactly 100', () => {
    const result = getPagination({ page: 1, limit: 100 })
    expect(result.limit).toBe(100)
  })

  it('handles limit of exactly 1', () => {
    const result = getPagination({ page: 2, limit: 1 })
    expect(result).toEqual({ page: 2, limit: 1, skip: 1, take: 1 })
  })
})

// ── calculateSOH ────────────────────────────────────────

describe('calculateSOH', () => {
  it('returns stokAwal when no ledger entries', () => {
    expect(calculateSOH(100, null, [])).toBe(100)
  })

  it('returns stokAwal when opnameDate is null and entries exist', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'IN', qty: 50, trxDate: '2026-06-10' },
    ]
    expect(calculateSOH(100, null, entries)).toBe(150)
  })

  it('adds IN entries', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'IN', qty: 30, trxDate: '2026-06-10' },
    ]
    expect(calculateSOH(100, null, entries)).toBe(130)
  })

  it('subtracts OUT entries', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'OUT', qty: 20, trxDate: '2026-06-10' },
    ]
    expect(calculateSOH(100, null, entries)).toBe(80)
  })

  it('calculates mixed IN and OUT entries', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'IN', qty: 50, trxDate: '2026-06-10' },
      { sku: 'A', direction: 'OUT', qty: 20, trxDate: '2026-06-11' },
      { sku: 'A', direction: 'IN', qty: 10, trxDate: '2026-06-12' },
    ]
    expect(calculateSOH(100, null, entries)).toBe(140)
  })

  it('filters entries before lastOpnameDate', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'IN', qty: 50, trxDate: '2026-06-01' }, // before cutoff
      { sku: 'A', direction: 'IN', qty: 30, trxDate: '2026-06-15' }, // on/after cutoff
    ]
    const opnameDate = new Date('2026-06-15T00:00:00+07:00')
    expect(calculateSOH(100, opnameDate, entries)).toBe(130)
  })

  it('includes entries on exact opnameDate', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'IN', qty: 20, trxDate: new Date('2026-06-15T00:00:00+07:00') },
    ]
    const opnameDate = new Date('2026-06-15T00:00:00+07:00')
    expect(calculateSOH(100, opnameDate, entries)).toBe(120)
  })

  it('handles opnameDate as string', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'OUT', qty: 10, trxDate: '2026-06-20' },
    ]
    expect(calculateSOH(100, '2026-06-15', entries)).toBe(90)
  })

  it('handles zero stokAwal', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'IN', qty: 50, trxDate: '2026-06-10' },
    ]
    expect(calculateSOH(0, null, entries)).toBe(50)
  })

  it('handles negative stokAwal', () => {
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'IN', qty: 10, trxDate: '2026-06-10' },
    ]
    expect(calculateSOH(-5, null, entries)).toBe(5)
  })

  it('filters entries that are strictly before opnameDate', () => {
    // opname at noon — entry at midnight of same day should be excluded
    const entries: LedgerEntry[] = [
      { sku: 'A', direction: 'IN', qty: 99, trxDate: new Date('2026-06-15T00:00:00+07:00') },
    ]
    const opnameDate = new Date('2026-06-15T12:00:00+07:00')
    expect(calculateSOH(100, opnameDate, entries)).toBe(100)
  })
})

// ── safeInt ─────────────────────────────────────────────

describe('safeInt', () => {
  it('parses a valid integer string', () => {
    expect(safeInt('42')).toBe(42)
  })

  it('parses a valid integer number', () => {
    expect(safeInt(42)).toBe(42)
  })

  it('truncates decimal values', () => {
    expect(safeInt('42.9')).toBe(42)
  })

  it('returns fallback for NaN input', () => {
    expect(safeInt('abc')).toBe(0)
  })

  it('returns custom fallback for invalid input', () => {
    expect(safeInt('abc', 99)).toBe(99)
  })

  it('returns fallback for null', () => {
    expect(safeInt(null)).toBe(0)
  })

  it('returns fallback for undefined', () => {
    expect(safeInt(undefined)).toBe(0)
  })

  it('returns fallback for empty string', () => {
    expect(safeInt('')).toBe(0)
  })

  it('parses negative integers', () => {
    expect(safeInt('-10')).toBe(-10)
  })

  it('parses zero', () => {
    expect(safeInt('0')).toBe(0)
  })

  it('parses string with trailing non-numeric chars', () => {
    expect(safeInt('100abc')).toBe(100)
  })
})

// ── safeFloat ───────────────────────────────────────────

describe('safeFloat', () => {
  it('parses a valid float string', () => {
    expect(safeFloat('3.14')).toBeCloseTo(3.14)
  })

  it('parses a valid float number', () => {
    expect(safeFloat(3.14)).toBeCloseTo(3.14)
  })

  it('parses integer strings as float', () => {
    expect(safeFloat('42')).toBeCloseTo(42)
  })

  it('returns fallback for NaN input', () => {
    expect(safeFloat('abc')).toBe(0)
  })

  it('returns custom fallback for invalid input', () => {
    expect(safeFloat('abc', 1.5)).toBeCloseTo(1.5)
  })

  it('returns fallback for null', () => {
    expect(safeFloat(null)).toBe(0)
  })

  it('returns fallback for undefined', () => {
    expect(safeFloat(undefined)).toBe(0)
  })

  it('returns fallback for empty string', () => {
    expect(safeFloat('')).toBe(0)
  })

  it('parses negative floats', () => {
    expect(safeFloat('-2.5')).toBeCloseTo(-2.5)
  })

  it('parses zero', () => {
    expect(safeFloat('0')).toBe(0)
  })

  it('parses scientific notation', () => {
    expect(safeFloat('1e3')).toBeCloseTo(1000)
  })
})
