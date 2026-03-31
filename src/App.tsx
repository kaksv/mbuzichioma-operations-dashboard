import { useEffect, useMemo, useState } from 'react'
import {
  getOrders,
  getOverview,
  getProducts,
  updateOrderStatus,
  type AdminOrder,
  type AdminOverview,
  type AdminProduct,
} from './lib/api'

function formatUGX(n: number) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString()
}

function statusBadge(status: string | undefined) {
  switch (status) {
    case 'confirmed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'cancelled':
      return 'bg-red-100 text-red-700 border-red-200'
    default:
      return 'bg-amber-100 text-amber-700 border-amber-200'
  }
}

export default function App() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)

  async function loadAll(filter = statusFilter) {
    setLoading(true)
    setError(null)
    try {
      const [ov, ps, os] = await Promise.all([getOverview(), getProducts(), getOrders(filter, 100)])
      setOverview(ov)
      setProducts(ps)
      setOrders(os)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedImageIndex == null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedImageIndex(null)
        return
      }
      if (e.key === 'ArrowRight') {
        setSelectedImageIndex((curr) => {
          if (curr == null || products.length === 0) return curr
          return (curr + 1) % products.length
        })
      }
      if (e.key === 'ArrowLeft') {
        setSelectedImageIndex((curr) => {
          if (curr == null || products.length === 0) return curr
          return (curr - 1 + products.length) % products.length
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedImageIndex, products.length])

  useEffect(() => {
    if (selectedImageIndex == null) return
    if (selectedImageIndex >= products.length) {
      setSelectedImageIndex(products.length > 0 ? 0 : null)
    }
  }, [products.length, selectedImageIndex])

  async function onChangeStatus(orderId: string, status: string) {
    setSavingOrderId(orderId)
    setError(null)
    try {
      const updated = await updateOrderStatus(orderId, status)
      setOrders((list) => list.map((o) => (o.id === orderId ? updated : o)))
      const nextOverview = await getOverview()
      setOverview(nextOverview)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update order status')
    } finally {
      setSavingOrderId(null)
    }
  }

  const cards = useMemo(
    () => [
      { label: 'Products', value: String(overview?.products ?? 0), hint: 'Active package sizes' },
      { label: 'Orders Today', value: String(overview?.ordersToday ?? 0), hint: 'Created since midnight' },
      { label: 'Pending', value: String(overview?.pending ?? 0), hint: 'Awaiting confirmation' },
    ],
    [overview],
  )

  const selectedImage =
    selectedImageIndex != null && selectedImageIndex >= 0 && selectedImageIndex < products.length
      ? products[selectedImageIndex]
      : null

  function goNextImage() {
    if (products.length === 0 || selectedImageIndex == null) return
    setSelectedImageIndex((selectedImageIndex + 1) % products.length)
  }

  function goPrevImage() {
    if (products.length === 0 || selectedImageIndex == null) return
    setSelectedImageIndex((selectedImageIndex - 1 + products.length) % products.length)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-orange-50">
      <header className="mx-auto w-full max-w-7xl px-4 pt-6">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-lg">
          <div className="text-xs font-bold uppercase tracking-wide text-orange-600">Mbuzzi Choma Admin</div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Connected to live admin API endpoints.</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 space-y-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <article key={c.label} className="rounded-2xl border border-black/5 bg-white p-4 shadow-lg">
              <div className="text-sm text-slate-500">{c.label}</div>
              <div className="mt-1 text-3xl font-black text-slate-900">{loading ? '...' : c.value}</div>
              <div className="mt-1 text-xs text-slate-500">{c.hint}</div>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-900">Products</h2>
            <button
              type="button"
              onClick={() => void loadAll(statusFilter)}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-semibold text-slate-700"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Thumbnail</th>
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2">Weight</th>
                  <th className="pb-2">Popular</th>
                  <th className="pb-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-black/5 text-slate-800">
                    <td className="py-2">
                      <button
                        type="button"
                        className="group relative block rounded-md border border-black/10"
                        onClick={() => setSelectedImageIndex(products.findIndex((x) => x.id === p.id))}
                        aria-label={`Preview ${p.title} image`}
                      >
                        <img
                          src={p.photoUrl}
                          alt={p.title}
                          className="h-12 w-16 rounded-md object-cover transition group-hover:opacity-90"
                          loading="lazy"
                          onError={(e) => {
                            const img = e.currentTarget
                            img.onerror = null
                            img.src = '/favicon.svg'
                          }}
                        />
                      </button>
                    </td>
                    <td className="py-2 font-mono text-xs">{p.id}</td>
                    <td className="py-2">{p.title}</td>
                    <td className="py-2">{formatUGX(p.priceUGX)}</td>
                    <td className="py-2">{p.weightKg}kg</td>
                    <td className="py-2">{p.popular ? 'Yes' : 'No'}</td>
                    <td className="py-2">{p.active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {!loading && products.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={7}>
                      No products found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-900">Orders</h2>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={async (e) => {
                  const next = e.target.value
                  setStatusFilter(next)
                  await loadAll(next)
                }}
                className="rounded-lg border border-black/10 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {orders.map((o) => (
              <article key={o.id} className="rounded-xl border border-black/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{o.packageTitle}</div>
                    <div className="text-xs text-slate-500">{o.id}</div>
                  </div>
                  <div className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge(o.status)}`}>
                    {o.status ?? 'pending'}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="text-slate-500">Customer:</span> {o.customer.fullName}
                  </div>
                  <div>
                    <span className="text-slate-500">Phone:</span> {o.customer.phone}
                  </div>
                  <div>
                    <span className="text-slate-500">Total:</span> {formatUGX(o.totalUGX)}
                  </div>
                  <div>
                    <span className="text-slate-500">Created:</span> {formatTime(o.createdAtISO)}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">Update status:</label>
                  <select
                    value={o.status ?? 'pending'}
                    disabled={savingOrderId === o.id}
                    onChange={async (e) => {
                      await onChangeStatus(o.id, e.target.value)
                    }}
                    className="rounded-lg border border-black/10 px-3 py-1.5 text-sm"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </article>
            ))}

            {!loading && orders.length === 0 ? (
              <div className="rounded-xl border border-black/5 p-4 text-sm text-slate-500">No orders found.</div>
            ) : null}
          </div>
        </section>
      </main>

      {selectedImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedImageIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Product image preview"
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-sm font-bold text-white"
              onClick={goPrevImage}
              aria-label="Previous image"
            >
              Prev
            </button>
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-sm font-bold text-white"
              onClick={goNextImage}
              aria-label="Next image"
            >
              Next
            </button>
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm font-bold text-white"
              onClick={() => setSelectedImageIndex(null)}
            >
              Close
            </button>
            <img
              src={selectedImage.photoUrl}
              alt={selectedImage.title}
              className="max-h-[80vh] w-auto max-w-[90vw] object-contain"
              onError={(e) => {
                const img = e.currentTarget
                img.onerror = null
                img.src = '/favicon.svg'
              }}
            />
            <div className="border-t border-black/10 px-4 py-2 text-sm font-semibold text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span>{selectedImage.title}</span>
                <span className="text-xs font-medium text-slate-500">
                  {selectedImageIndex! + 1} / {products.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
