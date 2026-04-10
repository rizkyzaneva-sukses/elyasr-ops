'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { formatRupiah, formatDate, downloadCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import Papa from 'papaparse'
import { TrendingUp, Upload, Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

export default function PayoutsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [walletId, setWalletId] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const limit = 50

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallet').then(r => r.json()).then(d => d.data ?? []),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['payouts', walletId, page],
    queryFn: () => {
      const p = new URLSearchParams({ walletId, page: String(page), limit: String(limit) })
      return fetch(`/api/payouts?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const payouts = data?.payouts ?? []
  const total = data?.total ?? 0
  const summary = data?.summary ?? {}
  const totalPages = Math.ceil(total / limit)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !walletId) {
      toast({ title: 'Pilih wallet terlebih dahulu', type: 'error' })
      return
    }
    setImporting(true)
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        try {
          const res = await fetch('/api/payouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payouts: results.data, walletId }),
          })
          const json = await res.json()
          if (res.ok) {
            toast({ title: `${json.data.inserted} payout diimport, ${json.data.skipped} duplikat`, type: 'success' })
            qc.invalidateQueries({ queryKey: ['payouts'] })
            qc.invalidateQueries({ queryKey: ['wallets'] })
          } else {
            toast({ title: json.error, type: 'error' })
          }
        } catch { toast({ title: 'Gagal upload', type: 'error' }) }
        finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
      },
    })
  }

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <TrendingUp size={22} className="text-emerald-400" /> Payout
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">{total.toLocaleString('id')} record</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={walletId} onChange={e => setWalletId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
            <option value="">Semua Wallet</option>
            {(wallets ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Omzet', value: formatRupiah(summary.totalOmzet ?? 0, true), color: 'text-white' },
          { label: 'Total Cair', value: formatRupiah(summary.totalIncome ?? 0, true), color: 'text-emerald-400' },
          { label: 'Fee Platform', value: formatRupiah(summary.totalPlatformFee ?? 0, true), color: 'text-red-400' },
          { label: 'Fee AMS', value: formatRupiah(summary.totalAmsFee ?? 0, true), color: 'text-orange-400' },
        ].map(c => (
          <div key={c.label} className="stat-card">
            <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="text-xs text-zinc-600 mb-3 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-lg px-3 py-2">
        Format CSV: <span className="text-zinc-400 font-mono">order_no, released_date, omzet, platform_fee, ams_fee</span>
        {' · '}Duplikat otomatis dilewati
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>No. Order</th>
                <th className="w-28">Tgl Cair</th>
                <th className="w-28 text-right">Omzet</th>
                <th className="w-24 text-right">Fee Platform</th>
                <th className="w-24 text-right">Fee AMS</th>
                <th className="w-28 text-right">Total Cair</th>
                <th className="w-28">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({length:8}).map((_,i) => (
                <tr key={i}>{Array.from({length:7}).map((_,j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
              )) : payouts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-zinc-600">Belum ada data payout</td></tr>
              ) : payouts.map((p: any) => (
                <tr key={p.id}>
                  <td><span className="font-mono text-xs text-zinc-400">{p.orderNo}</span></td>
                  <td className="text-xs text-zinc-400">{formatDate(p.releasedDate)}</td>
                  <td className="text-right text-xs text-zinc-300">{formatRupiah(p.omzet, true)}</td>
                  <td className="text-right text-xs text-red-400">{formatRupiah(p.platformFee, true)}</td>
                  <td className="text-right text-xs text-orange-400">{formatRupiah(p.amsFee, true)}</td>
                  <td className="text-right text-sm font-medium text-emerald-400">{formatRupiah(p.totalIncome, true)}</td>
                  <td className="text-xs text-zinc-500">{p.wallet?.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} record</p>
            <div className="flex gap-1 items-center">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronLeft size={14}/></button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
