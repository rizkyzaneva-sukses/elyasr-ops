'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatDate, downloadCSV } from '@/lib/utils'
import { Package, Search, Download, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react'

function StockBadge({ status }: { status: string }) {
  if (status === 'EMPTY') return <span className="badge-danger">Habis</span>
  if (status === 'LOW') return <span className="badge-warning">Kritis</span>
  return <span className="badge-success">Aman</span>
}

export default function InventoryPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'empty'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory', search, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ search, belowRop: String(filter !== 'all') })
      const res = await fetch(`/api/inventory?${params}`)
      return res.json().then(d => d.data)
    },
  })

  const allProducts = data?.products ?? []
  const summary = data?.summary ?? {}

  const products = filter === 'empty'
    ? allProducts.filter((p: any) => p.soh <= 0)
    : filter === 'low'
    ? allProducts.filter((p: any) => p.soh > 0 && p.isBelowRop)
    : allProducts

  const categories = [...new Set(allProducts.map((p: any) => p.categoryName).filter(Boolean))] as string[]
  const filtered = categoryFilter ? products.filter((p: any) => p.categoryName === categoryFilter) : products

  const handleExport = () => {
    downloadCSV('stok-inventory.csv', filtered.map((p: any) => ({
      SKU: p.sku,
      'Nama Produk': p.productName,
      Kategori: p.categoryName || '',
      Satuan: p.unit,
      SOH: p.soh,
      ROP: p.rop,
      Status: p.stockStatus,
      HPP: p.hpp,
    })))
  }

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Package size={22} className="text-emerald-400" />
            Inventori
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">{summary.totalProducts ?? 0} produk aktif</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors">
            <RefreshCw size={14} />
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700">
            <Download size={14} />Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Stok Habis', value: summary.emptyStock ?? 0, color: 'red', filterKey: 'empty' },
          { label: 'Stok Kritis', value: summary.lowStock ?? 0, color: 'yellow', filterKey: 'low' },
          { label: 'Stok Aman', value: summary.okStock ?? 0, color: 'emerald', filterKey: 'all' },
        ].map(c => (
          <button
            key={c.filterKey}
            onClick={() => setFilter(c.filterKey as any)}
            className={`stat-card text-left transition-all ${filter === c.filterKey ? 'ring-2 ring-emerald-500/50' : ''}`}
          >
            <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color === 'red' ? 'text-red-400' : c.color === 'yellow' ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {c.value}
            </p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari SKU atau nama produk..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none"
        >
          <option value="">Semua Kategori</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-32">SKU</th>
                <th>Nama Produk</th>
                <th className="w-28">Kategori</th>
                <th className="w-20 text-center">SOH</th>
                <th className="w-20 text-center">ROP</th>
                <th className="w-20 text-right">HPP</th>
                <th className="w-24">Status</th>
                <th className="w-28">Last Opname</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                    <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-zinc-600">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Tidak ada produk ditemukan</p>
                  </td>
                </tr>
              ) : (
                filtered.map((p: any) => (
                  <tr key={p.id}>
                    <td><span className="font-mono text-xs text-zinc-400">{p.sku}</span></td>
                    <td>
                      <p className="text-sm text-zinc-200">{p.productName}</p>
                      {p.variantInfo && <p className="text-[10px] text-zinc-600">{JSON.stringify(p.variantInfo)}</p>}
                    </td>
                    <td><span className="text-xs text-zinc-400">{p.categoryName || '—'}</span></td>
                    <td className="text-center">
                      <span className={`font-bold text-sm ${p.soh <= 0 ? 'text-red-400' : p.isBelowRop ? 'text-yellow-400' : 'text-white'}`}>
                        {p.soh}
                      </span>
                      <span className="text-zinc-600 text-[10px] ml-0.5">{p.unit}</span>
                    </td>
                    <td className="text-center text-xs text-zinc-500">{p.rop}</td>
                    <td className="text-right text-xs text-zinc-400">
                      {p.hpp ? `Rp ${p.hpp.toLocaleString('id')}` : '—'}
                    </td>
                    <td><StockBadge status={p.stockStatus} /></td>
                    <td className="text-[10px] text-zinc-600">{p.lastOpnameDate ? formatDate(p.lastOpnameDate) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">Menampilkan {filtered.length} produk</p>
        </div>
      </div>
    </AppLayout>
  )
}
