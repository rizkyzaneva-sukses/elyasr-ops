'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/ui/toaster'
import { Settings, Loader2, AlertTriangle, Trash2, X, Shield } from 'lucide-react'
import { TelegramSection } from './telegram-section'

export function PengaturanTab() {
  const { toast } = useToast()
  const [shopee, setShopee] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setShopee(d.data?.biaya_admin_shopee ?? '14')
          setTiktok(d.data?.biaya_admin_tiktok ?? '14.1')
        }
      })
      .finally(() => setFetching(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const results = await Promise.all([
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'biaya_admin_shopee', value: shopee }),
        }),
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'biaya_admin_tiktok', value: tiktok }),
        }),
      ])
      const jsons = await Promise.all(results.map(r => r.json()))
      const failed = jsons.find(j => !j.success)
      if (failed) throw new Error(failed.error)
      toast({ title: 'Pengaturan berhasil disimpan', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal menyimpan', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={16} className="text-emerald-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Biaya Admin Platform</h2>
      </div>
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-3 mb-5">
        <p className="text-xs text-amber-300">
          Perubahan hanya berlaku untuk data order yang diupload setelah penyimpanan ini.
          Data order yang sudah ada tidak akan terpengaruh.
        </p>
      </div>
      {fetching ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 size={14} className="animate-spin" /> Memuat pengaturan...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Biaya Admin Shopee (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={shopee}
              onChange={e => setShopee(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Biaya Admin TikTok (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={tiktok}
              onChange={e => setTiktok(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </form>
      )}

      {/* Telegram Notification Settings */}
      <TelegramSection />

      {/* Reset Keuangan — DANGER ZONE */}
      <ResetKeuanganSection />
    </div>
  )
}

function ResetKeuanganSection() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleReset = async () => {
    if (confirmText !== 'RESET') return
    setLoading(true)
    try {
      const res = await fetch('/api/wallet/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESET' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResult(json.data)
      toast({ title: 'Keuangan berhasil di-reset ✅', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal reset', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="mt-8 border-t border-zinc-800 pt-6">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={16} className="text-red-400" />
        <h2 className="text-sm font-semibold text-red-400">Danger Zone — Reset Keuangan</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        Reset semua transaksi wallet_ledger ke saldo awal (modal_awal). SEMUA data transaksi (expense, transfer, payout, vendor payment) akan dihapus permanen.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-800/50 rounded-lg px-4 py-2 text-sm font-medium transition-colors">
          <Trash2 size={14} /> Reset Keuangan
        </button>
      ) : (
        <div className="bg-red-900/10 border border-red-800/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-red-300">Konfirmasi Reset</h3>
            <button onClick={() => { setOpen(false); setConfirmText(''); setResult(null) }}
              className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
          </div>

          {result ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-400 font-medium">Reset berhasil!</p>
              <p className="text-xs text-zinc-400">{result.deletedCount} transaksi dihapus</p>
              <div className="space-y-1">
                {result.wallets.map((w: any, i: number) => (
                  <p key={i} className="text-xs text-zinc-500">• {w.wallet}: modal awal {w.amount.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })}</p>
                ))}
              </div>
              <button onClick={() => { setOpen(false); setResult(null); setConfirmText('') }}
                className="text-xs text-zinc-400 hover:text-white mt-2">Tutup</button>
            </div>
          ) : (
            <>
              <div className="bg-red-900/20 rounded-lg px-3 py-2">
                <p className="text-xs text-red-300">
                  Semua transaksi akan dihapus. Saldo setiap wallet akan dikembalikan ke modal awal yang sudah di-setup.
                </p>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Ketik <b className="text-red-400">RESET</b> untuk konfirmasi</label>
                <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                  placeholder="Ketik RESET"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-red-600" />
              </div>
              <button onClick={handleReset} disabled={loading || confirmText !== 'RESET'}
                className="flex items-center gap-2 bg-red-700 hover:bg-red-600 disabled:opacity-30 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {loading ? 'Meriset...' : 'Ya, Reset Sekarang'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
