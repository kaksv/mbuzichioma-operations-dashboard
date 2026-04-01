import { useEffect, useMemo, useState } from 'react'
import {
  createProduct,
  getOrders,
  getOverview,
  getProducts,
  getTrashedProducts,
  moveProductToTrash,
  permanentlyDeleteProduct,
  restoreProduct,
  updateOrderStatus,
  updateProduct,
  uploadProductImage,
  type AdminOrder,
  type AdminOverview,
  type AdminProduct,
} from './lib/api'
import { resolveProductPhotoUrl } from './lib/resolvePhotoUrl'

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

function slugifyProductId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type ProductFormState = {
  id: string
  title: string
  weightKg: string
  priceUGX: string
  /** Stored value for the API: Cloudinary `public_id` or legacy; list loads may be full `https` from the API. */
  photoUrl: string
  /** Set after a browser upload so the thumbnail works without `VITE_CLOUDINARY_CLOUD_NAME`. */
  imagePreviewUrl?: string
  popular: boolean
  active: boolean
}

const emptyCreateForm: ProductFormState = {
  id: '',
  title: '',
  weightKg: '',
  priceUGX: '',
  photoUrl: '',
  popular: false,
  active: true,
}

export default function App() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [trashProducts, setTrashProducts] = useState<AdminProduct[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)

  const [createForm, setCreateForm] = useState<ProductFormState>(emptyCreateForm)
  const [createIdTouched, setCreateIdTouched] = useState(false)
  const [editProductId, setEditProductId] = useState<string>('')
  const [editForm, setEditForm] = useState<ProductFormState>(emptyCreateForm)
  const [savingProduct, setSavingProduct] = useState(false)
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  async function refreshOverview() {
    const nextOverview = await getOverview()
    setOverview(nextOverview)
  }

  async function loadAll(filter = statusFilter) {
    setLoading(true)
    setError(null)
    try {
      const [ov, ps, os, tp] = await Promise.all([getOverview(), getProducts(), getOrders(filter, 100), getTrashedProducts()])
      setOverview(ov)
      setProducts(ps)
      setOrders(os)
      setTrashProducts(tp)
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
    if (editProductId) return
    if (products.length === 0) return
    const first = products[0]
    setEditProductId(first.id)
    setEditForm({
      id: first.id,
      title: first.title,
      weightKg: String(first.weightKg),
      priceUGX: String(first.priceUGX),
      photoUrl: first.photoUrl,
      imagePreviewUrl: undefined,
      popular: !!first.popular,
      active: first.active,
    })
  }, [products, editProductId])

  useEffect(() => {
    if (!editProductId) return
    const p = products.find((x) => x.id === editProductId)
    if (!p) return
    setEditForm({
      id: p.id,
      title: p.title,
      weightKg: String(p.weightKg),
      priceUGX: String(p.priceUGX),
      photoUrl: p.photoUrl,
      imagePreviewUrl: undefined,
      popular: !!p.popular,
      active: p.active,
    })
  }, [editProductId, products])

  useEffect(() => {
    if (createIdTouched) return
    const next = slugifyProductId(createForm.title)
    if (next !== createForm.id) {
      setCreateForm((prev) => ({ ...prev, id: next }))
    }
  }, [createForm.title, createForm.id, createIdTouched])

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
    if (createIdTouched) return
    const next = slugifyProductId(createForm.title)
    if (next !== createForm.id) {
      setCreateForm((prev) => ({ ...prev, id: next }))
    }
  }, [createForm.title, createForm.id, createIdTouched])

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
      await refreshOverview()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update order status')
    } finally {
      setSavingOrderId(null)
    }
  }

  async function onCreateProduct(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSavingProduct(true)
    try {
      await createProduct({
        id: createForm.id.trim(),
        title: createForm.title.trim(),
        weightKg: Number(createForm.weightKg),
        priceUGX: Number(createForm.priceUGX),
        photoUrl: createForm.photoUrl.trim(),
        popular: createForm.popular,
        active: createForm.active,
      })
      setCreateForm(emptyCreateForm)
      setCreateIdTouched(false)
      await loadAll(statusFilter)
    } catch (e2: unknown) {
      setError(e2 instanceof Error ? e2.message : 'Failed to create product')
    } finally {
      setSavingProduct(false)
    }
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editProductId) return
    setError(null)
    setSavingProduct(true)
    try {
      const updated = await updateProduct(editProductId, {
        title: editForm.title.trim(),
        weightKg: Number(editForm.weightKg),
        priceUGX: Number(editForm.priceUGX),
        photoUrl: editForm.photoUrl.trim(),
        popular: editForm.popular,
        active: editForm.active,
      })
      setEditForm((prev) => ({
        ...prev,
        photoUrl: updated.photoUrl,
        imagePreviewUrl: undefined,
      }))
      setProducts((list) => list.map((p) => (p.id === updated.id ? updated : p)))
      await refreshOverview()
    } catch (e2: unknown) {
      setError(e2 instanceof Error ? e2.message : 'Failed to update product')
    } finally {
      setSavingProduct(false)
    }
  }

  async function onUploadTo(field: 'create' | 'edit', file: File | null) {
    if (!file) return
    setError(null)
    setUploadingImage(true)
    try {
      const { publicId, secureUrl } = await uploadProductImage(file)
      if (field === 'create') {
        setCreateForm((s) => ({ ...s, photoUrl: publicId, imagePreviewUrl: secureUrl || undefined }))
      } else {
        setEditForm((s) => ({ ...s, photoUrl: publicId, imagePreviewUrl: secureUrl || undefined }))
      }
    } catch (e2: unknown) {
      setError(e2 instanceof Error ? e2.message : 'Image upload failed')
    } finally {
      setUploadingImage(false)
    }
  }

  async function onMoveToTrash(id: string) {
    setError(null)
    setTrashBusyId(id)
    try {
      const moved = await moveProductToTrash(id)
      setProducts((list) => list.filter((p) => p.id !== id))
      setTrashProducts((list) => [moved, ...list])
      if (editProductId === id) setEditProductId('')
      await refreshOverview()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to move product to trash')
    } finally {
      setTrashBusyId(null)
    }
  }

  async function onRestoreFromTrash(id: string) {
    setError(null)
    setTrashBusyId(id)
    try {
      const restored = await restoreProduct(id)
      setTrashProducts((list) => list.filter((p) => p.id !== id))
      setProducts((list) => [restored, ...list])
      await refreshOverview()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to restore product')
    } finally {
      setTrashBusyId(null)
    }
  }

  async function onPermanentDelete(id: string) {
    const ok = window.confirm('Permanently delete this product from trash? This cannot be undone.')
    if (!ok) return

    setError(null)
    setTrashBusyId(id)
    try {
      await permanentlyDeleteProduct(id)
      setTrashProducts((list) => list.filter((p) => p.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to permanently delete product')
    } finally {
      setTrashBusyId(null)
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

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <form onSubmit={onCreateProduct} className="rounded-2xl border border-black/5 bg-white p-5 shadow-lg space-y-3">
            <h2 className="text-lg font-black text-slate-900">Create Product</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="flex gap-2">
                  <input className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="id (auto-generated)" value={createForm.id} onChange={(e)=>{ setCreateIdTouched(true); setCreateForm(s=>({...s,id:e.target.value})) }} required />
                  <button type="button" className="rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => { setCreateIdTouched(false); setCreateForm((prev) => ({ ...prev, id: slugifyProductId(prev.title) })) }}>Auto</button>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  ID allows lowercase letters, numbers, and dashes (e.g. <span className="font-mono">goat-mix-1</span>).
                  It auto-fills from title unless you edit it manually.
                </div>
              </div>
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="title" value={createForm.title} onChange={(e)=>setCreateForm(s=>({...s,title:e.target.value}))} required />
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="weight kg" type="number" step="0.01" value={createForm.weightKg} onChange={(e)=>setCreateForm(s=>({...s,weightKg:e.target.value}))} required />
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="price UGX" type="number" value={createForm.priceUGX} onChange={(e)=>setCreateForm(s=>({...s,priceUGX:e.target.value}))} required />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <div className="rounded-lg border border-dashed border-black/20 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {createForm.photoUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={createForm.imagePreviewUrl ?? resolveProductPhotoUrl(createForm.photoUrl)}
                      alt="New product preview"
                      className="h-12 w-16 rounded border border-black/10 object-cover"
                      onError={(e) => {
                        const img = e.currentTarget
                        img.onerror = null
                        img.src = '/favicon.svg'
                      }}
                    />
                    <div>
                      <div className="font-semibold text-slate-700">Image uploaded</div>
                      <div className="font-mono text-[11px] text-slate-500 break-all">{createForm.photoUrl}</div>
                    </div>
                  </div>
                ) : (
                  <div>No image uploaded yet.</div>
                )}
              </div>
              <label className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer text-center">
                {uploadingImage ? 'Uploading...' : createForm.photoUrl ? 'Replace image' : 'Upload image'}
                <input type="file" accept="image/*" className="hidden" onChange={(e)=>void onUploadTo('create', e.target.files?.[0] ?? null)} />
              </label>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={createForm.popular} onChange={(e)=>setCreateForm(s=>({...s,popular:e.target.checked}))} /> Popular</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={createForm.active} onChange={(e)=>setCreateForm(s=>({...s,active:e.target.checked}))} /> Active</label>
            </div>

            <button disabled={savingProduct || !createForm.photoUrl.trim()} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{savingProduct ? 'Saving...' : 'Create product'}</button>
          </form>

          <form onSubmit={onSaveEdit} className="rounded-2xl border border-black/5 bg-white p-5 shadow-lg space-y-3">
            <h2 className="text-lg font-black text-slate-900">Edit Product</h2>
            <select className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" value={editProductId} onChange={(e)=>setEditProductId(e.target.value)}>
              <option value="">Select product...</option>
              {products.map((p)=><option key={p.id} value={p.id}>{p.title} ({p.id})</option>)}
            </select>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="title" value={editForm.title} onChange={(e)=>setEditForm(s=>({...s,title:e.target.value}))} required />
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="weight kg" type="number" step="0.01" value={editForm.weightKg} onChange={(e)=>setEditForm(s=>({...s,weightKg:e.target.value}))} required />
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="price UGX" type="number" value={editForm.priceUGX} onChange={(e)=>setEditForm(s=>({...s,priceUGX:e.target.value}))} required />
              <div className="rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-700">Current image id</div>
                <div className="font-mono text-[11px] text-slate-500 break-all">{editForm.photoUrl || 'None'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <div className="rounded-lg border border-dashed border-black/20 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {editForm.photoUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={editForm.imagePreviewUrl ?? resolveProductPhotoUrl(editForm.photoUrl)}
                      alt="Edit product preview"
                      className="h-12 w-16 rounded border border-black/10 object-cover"
                      onError={(e) => {
                        const img = e.currentTarget
                        img.onerror = null
                        img.src = '/favicon.svg'
                      }}
                    />
                    <div>
                      <div className="font-semibold text-slate-700">Image ready</div>
                      <div className="text-slate-500">Upload a new one to replace.</div>
                    </div>
                  </div>
                ) : (
                  <div>No image uploaded yet.</div>
                )}
              </div>
              <label className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer text-center">
                {uploadingImage ? 'Uploading...' : 'Upload image'}
                <input type="file" accept="image/*" className="hidden" onChange={(e)=>void onUploadTo('edit', e.target.files?.[0] ?? null)} />
              </label>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editForm.popular} onChange={(e)=>setEditForm(s=>({...s,popular:e.target.checked}))} /> Popular</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editForm.active} onChange={(e)=>setEditForm(s=>({...s,active:e.target.checked}))} /> Active</label>
            </div>

            <button disabled={savingProduct || !editProductId || !editForm.photoUrl.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{savingProduct ? 'Saving...' : 'Save changes'}</button>
          </form>
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
                  <th className="pb-2">Actions</th>
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
                          src={resolveProductPhotoUrl(p.photoUrl)}
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
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => void onMoveToTrash(p.id)}
                        disabled={trashBusyId === p.id}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                      >
                        Trash
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && products.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={8}>
                      No products found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>


        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-900">Trash</h2>
            <div className="text-xs text-slate-500">Soft-deleted products</div>
          </div>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Deleted</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashProducts.map((p) => (
                  <tr key={p.id} className="border-t border-black/5 text-slate-800">
                    <td className="py-2 font-mono text-xs">{p.id}</td>
                    <td className="py-2">{p.title}</td>
                    <td className="py-2 text-xs text-slate-500">{p.deletedAtISO ? formatTime(p.deletedAtISO) : '-'}</td>
                    <td className="py-2 space-x-2">
                      <button
                        type="button"
                        onClick={() => void onRestoreFromTrash(p.id)}
                        disabled={trashBusyId === p.id}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => void onPermanentDelete(p.id)}
                        disabled={trashBusyId === p.id}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                      >
                        Delete permanently
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && trashProducts.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={4}>
                      Trash is empty.
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
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80"
              onClick={goPrevImage}
              aria-label="Previous image"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80"
              onClick={goNextImage}
              aria-label="Next image"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm font-bold text-white"
              onClick={() => setSelectedImageIndex(null)}
            >
              Close
            </button>
            <img
              src={resolveProductPhotoUrl(selectedImage.photoUrl)}
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
