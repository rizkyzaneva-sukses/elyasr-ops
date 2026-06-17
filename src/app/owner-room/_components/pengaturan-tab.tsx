'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/ui/toaster'
import { Settings, Loader2 } from 'lucide-react'
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
    <div className="max-w-lg">
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
    </div>
  )
}
