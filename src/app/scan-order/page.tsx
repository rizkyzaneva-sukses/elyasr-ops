'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useRef, useEffect } from 'react'
import { useToast } from '@/components/ui/toaster'
import { ScanLine, CheckCircle, XCircle, Package } from 'lucide-react'

function nowWIB(): string {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }) + ' WIB'
}

interface ScanResult {
  success: boolean
  orderNo?: string
  airwaybill?: string
  status?: string
  receiverName?: string
  productName?: string
  updatedCount?: number
  error?: string
  scannedAt?: string
}

function beep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const times = success ? 1 : 3
    for (let i = 0; i < times; i++) {
      setTimeout(() => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = success ? 880 : 220
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
        osc.start(); osc.stop(ctx.currentTime + 0.2)
      }, i * 300)
    }
  } catch {}
}

export default function ScanOrderPage() {
  const { toast } = useToast()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const lockRef = useRef(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleScan = async (awb: string) => {
    if (!awb.trim() || lockRef.current) return
    lockRef.current = true

    setLoading(true)
    try {
      const res = await fetch('/api/scan/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airwaybill: awb.trim() }),
      })
      const json = await res.json()

      if (res.ok) {
        const result: ScanResult = { success: true, ...json.data, scannedAt: nowWIB() }
        setLastResult(result)
        setScanHistory(prev => [result, ...prev.slice(0, 19)])
        beep(true)
      } else {
        const result: ScanResult = { success: false, error: json.error, airwaybill: awb, scannedAt: nowWIB() }
        setLastResult(result)
        beep(false)
      }
    } catch {
      setLastResult({ success: false, error: 'Koneksi gagal', airwaybill: awb })
      beep(false)
    } finally {
      setLoading(false)
      setInput('')
      // Release lock after 1.5s
      setTimeout(() => {
        lockRef.current = false
        inputRef.current?.focus()
      }, 1500)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleScan(input)
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <div className="page-header">
          <h1 className="page-title flex items-center gap-2">
            <ScanLine size={22} className="text-emerald-400" />
            Scan Resi Kirim
          </h1>
          <span className="text-xs text-zinc-600">{scanHistory.length} scan hari ini</span>
        </div>

        {/* Input */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-4">
          <p className="text-zinc-400 text-sm mb-4 text-center">Scan barcode resi atau ketik manual</p>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <ScanLine size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScan(input)}
                placeholder="No. resi / airwaybill..."
                disabled={loading || lockRef.current}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm transition-all"
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors"
            >
              {loading ? '...' : 'Scan'}
            </button>
          </form>
        </div>

        {/* Result */}
        {lastResult && (
          <div className={`rounded-2xl p-5 mb-4 border transition-all ${
            lastResult.success
              ? 'bg-emerald-900/20 border-emerald-700'
              : 'bg-red-900/20 border-red-700'
          }`}>
            <div className="flex items-center gap-3">
              {lastResult.success
                ? <CheckCircle size={24} className="text-emerald-400 shrink-0" />
                : <XCircle size={24} className="text-red-400 shrink-0" />
              }
              <div>
                {lastResult.success ? (
                  <>
                    <p className="font-semibold text-emerald-300">Berhasil!</p>
                    <p className="text-sm text-zinc-400">
                      Order <span className="text-white font-mono">{lastResult.orderNo}</span> →{' '}
                      <span className="text-emerald-400">TERKIRIM</span>
                      {lastResult.updatedCount && lastResult.updatedCount > 1 && ` (${lastResult.updatedCount} baris)`}
                    </p>
                    {lastResult.receiverName && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {lastResult.receiverName} · {lastResult.productName}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-red-300">Tidak Ditemukan</p>
                    <p className="text-sm text-zinc-400">{lastResult.error}</p>
                    <p className="text-xs font-mono text-zinc-500">{lastResult.airwaybill}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {scanHistory.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="text-sm text-zinc-400">Riwayat Scan</p>
            </div>
            <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
              {scanHistory.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  {r.success
                    ? <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                    : <XCircle size={14} className="text-red-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300 font-mono truncate">{r.orderNo || r.airwaybill}</p>
                    {r.scannedAt && <p className="text-[10px] text-zinc-600">{r.scannedAt}</p>}
                    {r.receiverName && <p className="text-[10px] text-zinc-600">{r.receiverName}</p>}
                  </div>
                  {r.success && <span className="badge-success text-[10px]">OK</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
