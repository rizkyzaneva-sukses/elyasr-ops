'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah } from '@/lib/utils'
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react'

function getDefaultRange() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
}

export default function ReportsPage() {
  const def = getDefaultRange()
  const [dateFrom, setDateFrom] = useState(def.from)
  const [dateTo, setDateTo] = useState(def.to)
  const [reportType, setReportType] = useState('summary')

  const { data, isLoading } = useQuery({
    queryKey: ['reports', dateFrom, dateTo, reportType],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo, type: reportType })
      return fetch(`/api/reports?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const setRange = (preset: string) => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const today = now.toISOString().slice(0, 10)
    if (preset === 'month') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)); setDateTo(today)
    } else if (preset === 'lastmonth') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10))
      setDateTo(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10))
    } else if (preset === 'quarter') {
      const q = Math.floor(now.getMonth() / 3)
      setDateFrom(new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10)); setDateTo(today)
    }
  }

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><BarChart3 size={22} className="text-emerald-400"/>Laporan</h1>
      </div>

      {/* Filter */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none"/>
          <span className="text-zinc-600 text-sm">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none"/>
        </div>
        <div className="flex gap-1">
          {[{k:'month',l:'Bulan ini'},{k:'lastmonth',l:'Bulan lalu'},{k:'quarter',l:'Kuartal ini'}].map(p => (
            <button key={p.k} onClick={() => setRange(p.k)}
              className="px-2.5 py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition-colors">{p.l}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="stat-card h-24 animate-pulse"/>)}
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total Real Omzet', value: formatRupiah(data?.omzet?.total ?? 0), icon: TrendingUp, color: 'text-emerald-400' },
              { label: 'Total HPP', value: formatRupiah(data?.omzet?.byPlatform?.reduce((s: number, p: any) => s + p.hpp, 0) ?? 0), icon: TrendingDown, color: 'text-red-400' },
              { label: 'Gross Profit', value: formatRupiah(data?.grossProfit ?? 0), icon: TrendingUp, color: 'text-blue-400' },
              { label: 'Gross Margin', value: `${data?.grossMargin ?? 0}%`, icon: BarChart3, color: 'text-purple-400' },
            ].map(c => (
              <div key={c.label} className="stat-card">
                <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
                <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Per Platform */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-sm font-medium text-zinc-300 mb-4">Performa per Platform</p>
              <div className="overflow-x-auto">
                <table className="data-table w-full text-xs">
                  <thead>
                    <tr><th>Platform</th><th className="text-right">Orders</th><th className="text-right">Omzet</th><th className="text-right">HPP</th><th className="text-right">GP</th><th className="text-right">Margin</th></tr>
                  </thead>
                  <tbody>
                    {(data?.omzet?.byPlatform ?? []).map((p: any) => (
                      <tr key={p.platform}>
                        <td><span className={`font-medium ${p.platform === 'TikTok' ? 'text-pink-400' : p.platform === 'Shopee' ? 'text-orange-400' : 'text-zinc-300'}`}>{p.platform}</span></td>
                        <td className="text-right text-zinc-400">{p.orders}</td>
                        <td className="text-right text-white">{formatRupiah(p.omzet, true)}</td>
                        <td className="text-right text-red-400">{formatRupiah(p.hpp, true)}</td>
                        <td className="text-right text-emerald-400">{formatRupiah(p.grossProfit, true)}</td>
                        <td className="text-right text-blue-400">{p.margin}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-sm font-medium text-zinc-300 mb-4">Top 10 SKU by Omzet</p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {(data?.topSkus ?? []).map((s: any, i: number) => (
                  <div key={s.sku} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-700 w-5 shrink-0">{i + 1}</span>
                    <span className="font-mono text-zinc-400 flex-1 truncate">{s.sku}</span>
                    <span className="text-zinc-500 shrink-0">{s.qty} pcs</span>
                    <span className="text-emerald-400 font-medium shrink-0">{formatRupiah(s.omzet, true)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cashflow */}
          {data?.payout && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-sm font-medium text-zinc-300 mb-4">Cashflow (Payout - Expense)</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Total Payout Cair</p>
                  <p className="text-lg font-bold text-emerald-400">{formatRupiah(data.payout.totalIncome ?? 0, true)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Total Expense</p>
                  <p className="text-lg font-bold text-red-400">{formatRupiah(data.expense?.total ?? 0, true)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Net Cashflow</p>
                  <p className={`text-lg font-bold ${(data.netCashflow ?? 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {formatRupiah(data.netCashflow ?? 0, true)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
