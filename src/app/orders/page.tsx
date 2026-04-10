'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { formatRupiah, formatDate, downloadCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { usePermission } from '@/components/providers'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import {
  ShoppingCart, Upload, Download, Search,
  RefreshCw, ChevronLeft, ChevronRight, CheckCircle2,
  Loader2, AlertCircle
} from 'lucide-react'

const STATUS_GROUPS = [
  { key: '', label: 'Semua' },
  { key: 'perlu_dikirim', label: 'Perlu Dikirim' },
  { key: 'terkirim', label: 'Terkirim' },
  { key: 'dicairkan', label: 'Dicairkan' },
  { key: 'batal', label: 'Dibatalkan' },
]

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="badge-muted">—</span>
  const s = status.toLowerCase()
  if (s.startsWith('terkirim')) return <span className="badge-success">Terkirim</span>
  if (s.includes('batal') || s.includes('cancel')) return <span className="badge-danger">Batal</span>
  if (s.includes('selesai') || s.includes('delivered')) return <span className="badge-info">Selesai</span>
  if (s.includes('dikirim') || s.includes('transit')) return <span className="badge-warning">{status}</span>
  return <span className="badge-muted">{status}</span>
}

interface ImportResult {
  inserted: number
  skipped: number
  platform: string
  message: string
}

export default function OrdersPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { canEdit } = usePermission()
  const fileRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [statusGroup, setStatusGroup] = useState('')
  const [platform, setPlatform] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const limit = 50

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orders', search, statusGroup, platform, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        search, statusGroup, platform, page: String(page), limit: String(limit),
      })
      const res = await fetch(`/api/orders?${params}`)
      return res.json().then(d => d.data)
    },
  })

  const orders = data?.orders ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  // ── Upload handler — auto detect TikTok/Shopee ──────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)

    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      let rawRows: Record<string, unknown>[] = []
      let headers: string[] = []

      if (ext === 'xlsx' || ext === 'xls') {
        // Excel (Shopee biasanya xlsx)
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        rawRows = json
        headers = Object.keys(json[0] ?? {})
      } else {
        // CSV (TikTok)
        const text = await file.text()
        // TikTok CSV: comma delimiter tapi ada tab noise di value
        const cleaned = text.replace(/\t,/g, ',').replace(/"\t\s*"/g, '""').replace(/\t"/g, '"')
        await new Promise<void>((resolve, reject) => {
          Papa.parse(cleaned, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              rawRows = results.data as Record<string, unknown>[]
              headers = results.meta.fields ?? []
              resolve()
            },
            error: reject,
          })
        })
      }

      if (rawRows.length === 0) {
        toast({ title: 'File kosong atau tidak bisa dibaca', type: 'error' })
        return
      }

      // Kirim ke API
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawRows, headers }),
      })
      const json = await res.json()

      if (res.ok) {
        setImportResult(json.data)
        toast({ title: json.data.message, type: 'success' })
        qc.invalidateQueries({ queryKey: ['orders'] })
      } else {
        toast({ title: json.error || 'Import gagal', type: 'error' })
      }
    } catch (err: any) {
      toast({ title: `Error: ${err.message || 'Gagal memproses file'}`, type: 'error' })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleExport = () => {
    downloadCSV(`orders-${new Date().toISOString().slice(0, 10)}.csv`,
      orders.map((o: any) => ({
        'No. Pesanan': o.orderNo,
        'Platform': o.platform,
        'SKU': o.sku,
        'Produk': o.productName,
        'Qty': o.qty,
        'Tgl Pesan': o.orderCreatedAt,
        'No. Resi': o.airwaybill,
        'Nama Penerima': o.receiverName,
        'No. Telepon': o.phone,
        'Kota': o.city,
        'Provinsi': o.province,
        'Status': o.status,
        'Harga Produk': o.totalProductPrice,
        'Real Omzet': o.realOmzet,
        'HPP': o.hpp,
        'Status Payout': o.payout ? 'Sudah Cair' : 'Belum Cair',
      }))
    )
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ShoppingCart size={22} className="text-emerald-400" />
            Pesanan
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">{total.toLocaleString('id')} total pesanan</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? 'Mengimport...' : 'Upload File'}
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700">
              <Download size={14} /> Export
            </button>
            <button onClick={() => refetch()} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="mb-4 bg-emerald-900/20 border border-emerald-800 rounded-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm text-emerald-300 font-medium">{importResult.message}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Platform terdeteksi: <span className="text-zinc-300">{importResult.platform}</span>
              {' · '}Diimport: <span className="text-zinc-300">{importResult.inserted}</span>
              {importResult.skipped > 0 && <> · Dilewati (duplikat): <span className="text-zinc-300">{importResult.skipped}</span></>}
            </p>
          </div>
          <button onClick={() => setImportResult(null)} className="ml-auto text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
        </div>
      )}

      {/* Hint upload */}
      {!importing && !importResult && canEdit && (
        <div className="mb-4 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-zinc-600">
          <AlertCircle size={13} />
          Upload file ekspor langsung dari TikTok (.csv) atau Shopee (.xlsx) — tanpa perlu edit manual.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Cari no. pesanan, resi, nama, SKU..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 flex-wrap">
          {STATUS_GROUPS.map(g => (
            <button
              key={g.key}
              onClick={() => { setStatusGroup(g.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                statusGroup === g.key
                  ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Platform filter */}
        <select
          value={platform}
          onChange={e => { setPlatform(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none"
        >
          <option value="">Semua Platform</option>
          <option value="TikTok">TikTok</option>
          <option value="Shopee">Shopee</option>
          <option value="Tokopedia">Tokopedia</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-36">No. Pesanan</th>
                <th className="w-32">SKU</th>
                <th>Produk</th>
                <th className="w-20">Platform</th>
                <th className="w-28">Penerima</th>
                <th className="w-28 text-right">Real Omzet</th>
                <th className="w-20 text-right">HPP</th>
                <th className="w-24">Status</th>
                <th className="w-20">Payout</th>
                <th className="w-24">Tgl Pesan</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 10 }).map((_, j) => (
                    <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-zinc-600">
                    <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Tidak ada pesanan</p>
                    {canEdit && <p className="text-xs mt-1">Upload file dari TikTok atau Shopee untuk mulai</p>}
                  </td>
                </tr>
              ) : (
                orders.map((o: any) => (
                  <tr key={o.id}>
                    <td>
                      <p className="font-mono text-xs text-zinc-300 truncate max-w-[130px]" title={o.orderNo}>{o.orderNo}</p>
                      {o.airwaybill && <p className="text-[10px] text-zinc-600 truncate">{o.airwaybill}</p>}
                    </td>
                    <td>
                      <span className="font-mono text-xs text-zinc-400">{o.sku || '—'}</span>
                    </td>
                    <td>
                      <p className="text-xs text-zinc-300 line-clamp-2">{o.productName || '—'}</p>
                      {o.qty > 1 && <p className="text-[10px] text-zinc-600">x{o.qty}</p>}
                    </td>
                    <td>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        o.platform === 'TikTok' ? 'bg-pink-900/30 text-pink-400' :
                        o.platform === 'Shopee' ? 'bg-orange-900/30 text-orange-400' :
                        'bg-zinc-800 text-zinc-400'
                      }`}>{o.platform || '—'}</span>
                    </td>
                    <td>
                      <p className="text-xs text-zinc-300 truncate">{o.receiverName || '—'}</p>
                      <p className="text-[10px] text-zinc-600">{o.city}</p>
                    </td>
                    <td className="text-right">
                      <p className="text-xs font-medium text-emerald-400">{formatRupiah(o.realOmzet, true)}</p>
                      {o.totalProductPrice !== o.realOmzet && (
                        <p className="text-[10px] text-zinc-600">{formatRupiah(o.totalProductPrice, true)}</p>
                      )}
                    </td>
                    <td className="text-right">
                      <p className="text-xs text-zinc-500">{o.hpp ? formatRupiah(o.hpp, true) : '—'}</p>
                    </td>
                    <td><StatusBadge status={o.status} /></td>
                    <td>
                      {o.payout
                        ? <span className="badge-info text-[10px]">Cair</span>
                        : <span className="text-zinc-700 text-[10px]">—</span>
                      }
                    </td>
                    <td className="text-[10px] text-zinc-500">{o.orderCreatedAt?.slice(0, 10) || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">
              {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} dari {total.toLocaleString('id')}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-zinc-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
