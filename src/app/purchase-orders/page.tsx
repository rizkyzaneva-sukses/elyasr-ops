'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { FileText, Plus, ChevronLeft, ChevronRight, Search, Eye } from 'lucide-react'

const PO_STATUS_COLOR: Record<string, string> = {
  OPEN: 'badge-warning', PARTIAL: 'badge-info', COMPLETED: 'badge-success', CANCELLED: 'badge-danger',
}
const PAY_STATUS_COLOR: Record<string, string> = {
  UNPAID: 'badge-danger', PARTIAL_PAID: 'badge-warning', PAID: 'badge-success',
}

function CreatePOModal({ vendors, products, onClose }: { vendors: any[]; products: any[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [vendorId, setVendorId] = useState('')
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10))
  const [expectedDate, setExpectedDate] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<{ sku: string; qtyOrder: number }[]>([{ sku: '', qtyOrder: 1 }])
  const [loading, setLoading] = useState(false)

  const addItem = () => setItems(p => [...p, { sku: '', qtyOrder: 1 }])
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: any) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendorId) { toast({ title: 'Pilih vendor', type: 'error' }); return }
    const validItems = items.filter(i => i.sku && i.qtyOrder > 0)
    if (!validItems.length) { toast({ title: 'Tambah minimal 1 item', type: 'error' }); return }
    setLoading(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, poDate, expectedDate: expectedDate || null, note, items: validItems }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: `PO ${json.data.poNumber} berhasil dibuat`, type: 'success' })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-white mb-5">Buat Purchase Order</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Vendor *</label>
              <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                <option value="">Pilih vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.namaVendor}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tanggal PO *</label>
              <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Estimasi Tiba</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Opsional"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"/>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-zinc-500 font-medium">Items</label>
              <button type="button" onClick={addItem} className="text-xs text-emerald-400 hover:text-emerald-300">+ Tambah Item</button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <select value={item.sku} onChange={e => updateItem(i, 'sku', e.target.value)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                    <option value="">Pilih SKU</option>
                    {products.map((p: any) => <option key={p.sku} value={p.sku}>{p.sku} — {p.productName}</option>)}
                  </select>
                  <input type="number" min={1} value={item.qtyOrder} onChange={e => updateItem(i, 'qtyOrder', Number(e.target.value))}
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-zinc-600 hover:text-red-400 px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm transition-colors">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
              {loading ? 'Menyimpan...' : 'Buat PO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PurchaseOrdersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const limit = 20

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', search, status, page],
    queryFn: () => {
      const p = new URLSearchParams({ search, status, page: String(page), limit: String(limit) })
      return fetch(`/api/purchase-orders?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const { data: vendors } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => fetch('/api/vendors?all=true').then(r => r.json()).then(d => d.data ?? []),
  })

  const { data: products } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => fetch('/api/products?limit=500&isActive=true').then(r => r.json()).then(d => d.data?.products ?? []),
  })

  const pos = data?.purchaseOrders ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  return (
    <AppLayout>
      {showCreate && vendors && products && (
        <CreatePOModal vendors={vendors} products={products} onClose={() => setShowCreate(false)} />
      )}
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><FileText size={22} className="text-emerald-400"/>Purchase Orders</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus size={14}/> Buat PO
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"/>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Cari no. PO atau vendor..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"/>
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
          <option value="">Semua Status</option>
          {['OPEN','PARTIAL','COMPLETED','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-36">No. PO</th>
                <th>Vendor</th>
                <th className="w-24">Tgl PO</th>
                <th className="w-20 text-center">Items</th>
                <th className="w-28 text-right">Total</th>
                <th className="w-28 text-right">Terbayar</th>
                <th className="w-24">Status</th>
                <th className="w-24">Bayar</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({length:6}).map((_,i)=>(
                <tr key={i}>{Array.from({length:8}).map((_,j)=><td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
              )) : pos.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-600">Belum ada Purchase Order</td></tr>
              ) : pos.map((po: any) => (
                <tr key={po.id}>
                  <td><span className="font-mono text-xs text-zinc-300">{po.poNumber}</span></td>
                  <td><p className="text-xs text-zinc-300">{po.vendorName}</p></td>
                  <td className="text-xs text-zinc-400">{formatDate(po.poDate)}</td>
                  <td className="text-center text-xs text-zinc-400">{po.totalItems}</td>
                  <td className="text-right text-xs text-zinc-300">{formatRupiah(po.totalAmount, true)}</td>
                  <td className="text-right text-xs text-emerald-400">{formatRupiah(po.totalPaid, true)}</td>
                  <td>
                    <span className={PO_STATUS_COLOR[po.status] || 'badge-muted'}>{po.status}</span>
                    <span className={`${PAY_STATUS_COLOR[po.paymentStatus] || 'badge-muted'} ml-1 text-[10px]`}>{po.paymentStatus}</span>
                  </td>
                  <td><span className="text-[10px] text-zinc-600">{po.totalQtyReceived}/{po.totalQtyOrder}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} PO</p>
            <div className="flex gap-1 items-center">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronLeft size={14}/></button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
