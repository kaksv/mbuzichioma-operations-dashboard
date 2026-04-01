import { useEffect, useMemo, useState } from 'react'
import {
  clearAdminToken,
  createAdminUser,
  createProduct,
  getAdminToken,
  getAdminUsers,
  getOrders,
  getOverview,
  getProducts,
  getTrashedProducts,
  loginAdmin,
  moveProductToTrash,
  permanentlyDeleteProduct,
  restoreProduct,
  setAdminToken,
  updateAdminUser,
  updateOrderStatus,
  updateProduct,
  uploadProductImage,
  type AdminAuthUser,
  type AdminOrder,
  type AdminOverview,
  type AdminProduct,
  type AdminUser,
  type AdminUserRole,
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

const adminUserStorageKey = 'mbz_admin_user'

function isUnauthorizedError(e: unknown): boolean {
  return e instanceof Error && /(Unauthorized|Forbidden|401|403)/i.test(e.message)
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
  const [selectedTrashImageIndex, setSelectedTrashImageIndex] = useState<number | null>(null)

  const [createForm, setCreateForm] = useState<ProductFormState>(emptyCreateForm)
  const [createIdTouched, setCreateIdTouched] = useState(false)
  const [editProductId, setEditProductId] = useState<string>('')
  const [editForm, setEditForm] = useState<ProductFormState>(emptyCreateForm)
  const [savingCreateProduct, setSavingCreateProduct] = useState(false)
  const [savingEditProduct, setSavingEditProduct] = useState(false)
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const [authUser, setAuthUser] = useState<AdminAuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userForm, setUserForm] = useState({
    email: '',
    fullName: '',
    password: '',
    role: 'ops_manager' as AdminUserRole,
  })
  const [creatingUser, setCreatingUser] = useState(false)

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
      if (isUnauthorizedError(e)) {
        clearAdminToken()
        localStorage.removeItem(adminUserStorageKey)
        setAuthUser(null)
        setError('Session expired. Please sign in again.')
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load admin data')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const token = getAdminToken()
    const raw = localStorage.getItem(adminUserStorageKey)
    if (token && raw) {
      try {
        const u = JSON.parse(raw) as AdminAuthUser
        setAuthUser(u)
        setLoginEmail(u.email)
        void loadAll('')
      } catch {
        clearAdminToken()
        localStorage.removeItem(adminUserStorageKey)
      }
    }
    setAuthLoading(false)
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
    if (selectedImageIndex == null && selectedTrashImageIndex == null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedImageIndex(null)
        setSelectedTrashImageIndex(null)
        return
      }
      if (selectedImageIndex != null) {
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
      } else if (selectedTrashImageIndex != null) {
        if (e.key === 'ArrowRight') {
          setSelectedTrashImageIndex((curr) => {
            if (curr == null || trashProducts.length === 0) return curr
            return (curr + 1) % trashProducts.length
          })
        }
        if (e.key === 'ArrowLeft') {
          setSelectedTrashImageIndex((curr) => {
            if (curr == null || trashProducts.length === 0) return curr
            return (curr - 1 + trashProducts.length) % trashProducts.length
          })
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedImageIndex, selectedTrashImageIndex, products.length, trashProducts.length])

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

  useEffect(() => {
    if (selectedTrashImageIndex == null) return
    if (selectedTrashImageIndex >= trashProducts.length) {
      setSelectedTrashImageIndex(trashProducts.length > 0 ? 0 : null)
    }
  }, [trashProducts.length, selectedTrashImageIndex])


  useEffect(() => {
    if (!authUser) return
    const id = window.setInterval(() => {
      void Promise.all([getOrders(statusFilter, 100), getOverview()])
        .then(([os, ov]) => {
          setOrders(os)
          setOverview(ov)
        })
        .catch(() => {
          // Keep current view if background poll fails.
        })
    }, 15000)

    return () => window.clearInterval(id)
  }, [statusFilter, authUser])

  async function loadUsers() {
    if (authUser?.role !== 'owner') return
    setUsersLoading(true)
    try {
      setUsers(await getAdminUsers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoggingIn(true)
    try {
      const res = await loginAdmin(loginEmail.trim(), loginPassword)
      setAdminToken(res.token)
      localStorage.setItem(adminUserStorageKey, JSON.stringify(res.user))
      setAuthUser(res.user)
      setLoginPassword('')
      await loadAll('')
      if (res.user.role === 'owner') {
        await loadUsers()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoggingIn(false)
    }
  }

  function onLogout() {
    clearAdminToken()
    localStorage.removeItem(adminUserStorageKey)
    setAuthUser(null)
    setOverview(null)
    setProducts([])
    setOrders([])
    setTrashProducts([])
    setUsers([])
  }

  async function onCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCreatingUser(true)
    try {
      await createAdminUser({
        email: userForm.email.trim(),
        fullName: userForm.fullName.trim(),
        password: userForm.password,
        role: userForm.role,
      })
      setUserForm({ email: '', fullName: '', password: '', role: 'ops_manager' })
      await loadUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user')
    } finally {
      setCreatingUser(false)
    }
  }

  async function onToggleUserActive(user: AdminUser) {
    try {
      const updated = await updateAdminUser(user.id, { active: !user.active })
      setUsers((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user')
    }
  }


  useEffect(() => {
    if (authUser?.role === 'owner') {
      void loadUsers()
    }
  }, [authUser?.role])

  async function onChangeStatus(orderId: string, status: string) {
    setSavingOrderId(orderId)
    setError(null)
    try {
      const updated = await updateOrderStatus(orderId, status)
      setOrders((list) => list.map((o) => (o.id === updated.id ? updated : o)))
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
    setSavingCreateProduct(true)
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
      setSavingCreateProduct(false)
    }
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editProductId) return
    setError(null)
    setSavingEditProduct(true)
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
      setSavingEditProduct(false)
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

  const selectedTrashImage =
    selectedTrashImageIndex != null &&
    selectedTrashImageIndex >= 0 &&
    selectedTrashImageIndex < trashProducts.length
      ? trashProducts[selectedTrashImageIndex]
      : null

  function goNextTrashImage() {
    if (trashProducts.length === 0 || selectedTrashImageIndex == null) return
    setSelectedTrashImageIndex((selectedTrashImageIndex + 1) % trashProducts.length)
  }

  function goPrevTrashImage() {
    if (trashProducts.length === 0 || selectedTrashImageIndex == null) return
    setSelectedTrashImageIndex(
      (selectedTrashImageIndex - 1 + trashProducts.length) % trashProducts.length,
    )
  }


  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-orange-50 grid place-items-center p-4">
        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-lg text-sm text-slate-600">Loading admin...</div>
      </div>
    )
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-orange-50 grid place-items-center p-4">
        <form onSubmit={onLogin} className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-6 shadow-lg space-y-3">
          <div className="text-xs font-bold uppercase tracking-wide text-orange-600">Mbuzzi Choma Admin</div>
          <h1 className="text-2xl font-black text-slate-900">Sign in</h1>
          {error ? <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <input className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="email" type="email" value={loginEmail} onChange={(e)=>setLoginEmail(e.target.value)} required />
          <input className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="password" type="password" value={loginPassword} onChange={(e)=>setLoginPassword(e.target.value)} required />
          <button disabled={loggingIn} className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{loggingIn ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-orange-50">
      <header className="mx-auto w-full max-w-7xl px-4 pt-6">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-orange-600">Mbuzzi Choma Admin</div>
              <h1 className="mt-1 text-2xl font-black text-slate-900">Operations Dashboard</h1>
              <p className="mt-1 text-sm text-slate-600">Connected to live admin API endpoints.</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-800">{authUser.fullName}</div>
              <div className="text-xs text-slate-500">{authUser.email} • {authUser.role}</div>
              <button type="button" onClick={onLogout} className="mt-2 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-slate-700">Logout</button>
            </div>
          </div>
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

        {authUser.role === 'owner' ? (
          <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-900">User Management</h2>
              <button type="button" onClick={() => void loadUsers()} className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-semibold text-slate-700">Refresh</button>
            </div>

            <form onSubmit={onCreateUser} className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="email" type="email" value={userForm.email} onChange={(e)=>setUserForm((s)=>({...s,email:e.target.value}))} required />
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="full name" value={userForm.fullName} onChange={(e)=>setUserForm((s)=>({...s,fullName:e.target.value}))} required />
              <input className="rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="temporary password" type="password" minLength={8} value={userForm.password} onChange={(e)=>setUserForm((s)=>({...s,password:e.target.value}))} required />
              <select className="rounded-lg border border-black/10 px-3 py-2 text-sm" value={userForm.role} onChange={(e)=>setUserForm((s)=>({...s,role:e.target.value as AdminUserRole}))}>
                <option value="ops_manager">ops_manager</option>
                <option value="delivery_person">delivery_person</option>
                <option value="owner">owner</option>
              </select>
              <button disabled={creatingUser} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{creatingUser ? 'Creating...' : 'Create user'}</button>
            </form>

            <div className="overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Role</th>
                    <th className="pb-2">Active</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-black/5 text-slate-800">
                      <td className="py-2">{u.fullName}</td>
                      <td className="py-2">{u.email}</td>
                      <td className="py-2">{u.role}</td>
                      <td className="py-2">{u.active ? 'Yes' : 'No'}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => void onToggleUserActive(u)} className="rounded-md border border-black/10 px-2 py-1 text-xs font-semibold text-slate-700">{u.active ? 'Deactivate' : 'Activate'}</button>
                      </td>
                    </tr>
                  ))}
                  {!usersLoading && users.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={5}>No users found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

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

            <button disabled={savingCreateProduct || !createForm.photoUrl.trim()} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{savingCreateProduct ? 'Saving...' : 'Create product'}</button>
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

            <button disabled={savingEditProduct || !editProductId || !editForm.photoUrl.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{savingEditProduct ? 'Saving...' : 'Save changes'}</button>
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
                        onClick={() => {
                          setSelectedTrashImageIndex(null)
                          setSelectedImageIndex(products.findIndex((x) => x.id === p.id))
                        }}
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
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Thumbnail</th>
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Deleted</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashProducts.map((p) => (
                  <tr key={p.id} className="border-t border-black/5 text-slate-800">
                    <td className="py-2">
                      <button
                        type="button"
                        className="group relative block rounded-md border border-black/10"
                        onClick={() => {
                          setSelectedImageIndex(null)
                          setSelectedTrashImageIndex(trashProducts.findIndex((x) => x.id === p.id))
                        }}
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
                    <td className="py-3 text-slate-500" colSpan={5}>
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

                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <span className="text-slate-500">Customer:</span> {o.customer.fullName}
                  </div>
                  <div>
                    <span className="text-slate-500">Phone:</span> {o.customer.phone}
                  </div>
                  <div>
                    <span className="text-slate-500">Fulfillment:</span>{' '}
                    {o.fulfillmentType ?? '—'}
                    {o.deliveryFeePending ? ' (fee pending)' : ''}
                  </div>
                  <div>
                    <span className="text-slate-500">Payment:</span>{' '}
                    {o.paymentMethod ?? '—'} / {o.paymentStatus ?? '—'}
                  </div>
                  <div>
                    <span className="text-slate-500">Line:</span>{' '}
                    {o.subtotalUGX != null ? formatUGX(o.subtotalUGX) : '—'}
                    {o.deliveryFeeUGX != null && o.deliveryFeeUGX > 0 ? (
                      <span className="text-slate-500"> + delivery {formatUGX(o.deliveryFeeUGX)}</span>
                    ) : null}
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

      {selectedTrashImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedTrashImageIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Trashed product image preview"
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80"
              onClick={goPrevTrashImage}
              aria-label="Previous image"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80"
              onClick={goNextTrashImage}
              aria-label="Next image"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm font-bold text-white"
              onClick={() => setSelectedTrashImageIndex(null)}
            >
              Close
            </button>
            <img
              src={resolveProductPhotoUrl(selectedTrashImage.photoUrl)}
              alt={selectedTrashImage.title}
              className="max-h-[80vh] w-auto max-w-[90vw] object-contain"
              onError={(e) => {
                const img = e.currentTarget
                img.onerror = null
                img.src = '/favicon.svg'
              }}
            />
            <div className="border-t border-black/10 px-4 py-2 text-sm font-semibold text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span>{selectedTrashImage.title}</span>
                <span className="text-xs font-medium text-slate-500">
                  {selectedTrashImageIndex! + 1} / {trashProducts.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
