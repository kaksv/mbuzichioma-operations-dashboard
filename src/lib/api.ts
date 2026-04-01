const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const adminTokenKey = 'mbz_admin_token'

export type AdminUserRole = 'owner' | 'ops_manager' | 'delivery_person'

export type AdminAuthUser = {
  id: string
  email: string
  fullName: string
  role: AdminUserRole
}

export type AdminUser = AdminAuthUser & {
  active: boolean
  createdAtISO?: string
  updatedAtISO?: string
}

export function getAdminToken(): string {
  return localStorage.getItem(adminTokenKey) ?? ''
}

export function setAdminToken(token: string) {
  localStorage.setItem(adminTokenKey, token)
}

export function clearAdminToken() {
  localStorage.removeItem(adminTokenKey)
}


export type AdminOverview = {
  products: number
  ordersToday: number
  pending: number
}

export type AdminProduct = {
  id: string
  title: string
  weightKg: number
  priceUGX: number
  photoUrl: string
  popular?: boolean
  active: boolean
  updatedAtISO: string
  deletedAtISO: string | null
}

export type AdminOrder = {
  id: string
  packageId: string
  packageTitle: string
  unitPriceUGX: number
  quantity: number
  subtotalUGX?: number
  deliveryFeeUGX?: number
  totalUGX: number
  fulfillmentType?: 'pickup' | 'delivery' | 'delivery_pending'
  deliveryFeePending?: boolean
  paymentMethod?: 'pesapal' | 'cash_on_delivery'
  paymentStatus?: 'pending' | 'paid' | 'failed'
  pesapalOrderTrackingId?: string
  customer: {
    fullName: string
    phone: string
    location: string
    notes?: string
  }
  transactionRef?: string
  createdAtISO: string
  status?: string
}

export type CreateProductInput = {
  id: string
  title: string
  weightKg: number
  priceUGX: number
  photoUrl: string
  popular?: boolean
  active?: boolean
}

export type UpdateProductInput = {
  title?: string
  weightKg?: number
  priceUGX?: number
  photoUrl?: string
  popular?: boolean
  active?: boolean
}

export type UploadProductImageResult = {
  publicId: string
  secureUrl: string
}

type CloudinarySignResponse = {
  cloudName: string
  apiKey: string
  folder: string
  timestamp: number
  signature: string
  publicId?: string
}

function adminHeaders(): HeadersInit {
  const headers: Record<string, string> = {}
  const token = getAdminToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const key = import.meta.env.VITE_ADMIN_API_KEY?.trim()
  if (key) headers['x-admin-key'] = key
  return headers
}

async function readError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: string }
    if (j.error) return j.error
  } catch {
    // ignore parse errors
  }
  return `Request failed (${r.status})`
}

export async function getOverview(): Promise<AdminOverview> {
  const r = await fetch(`${base}/api/admin/overview`, { headers: adminHeaders() })
  if (!r.ok) throw new Error(await readError(r))
  return (await r.json()) as AdminOverview
}

export async function getProducts(): Promise<AdminProduct[]> {
  const r = await fetch(`${base}/api/admin/products`, { headers: adminHeaders() })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { products: AdminProduct[] }
  return data.products
}

export async function getOrders(status = '', limit = 100): Promise<AdminOrder[]> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  params.set('limit', String(limit))
  const qs = params.toString()
  const r = await fetch(`${base}/api/admin/orders${qs ? `?${qs}` : ''}`, { headers: adminHeaders() })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { orders: AdminOrder[] }
  return data.orders
}

export async function updateOrderStatus(id: string, status: string): Promise<AdminOrder> {
  const r = await fetch(`${base}/api/admin/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { order: AdminOrder }
  return data.order
}

export async function createProduct(body: CreateProductInput): Promise<AdminProduct> {
  const r = await fetch(`${base}/api/admin/products`, {
    method: 'POST',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { product: AdminProduct }
  return data.product
}

export async function updateProduct(id: string, body: UpdateProductInput): Promise<AdminProduct> {
  const r = await fetch(`${base}/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { product: AdminProduct }
  return data.product
}


export async function getTrashedProducts(): Promise<AdminProduct[]> {
  const r = await fetch(`${base}/api/admin/products/trash`, { headers: adminHeaders() })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { products: AdminProduct[] }
  return data.products
}

export async function moveProductToTrash(id: string): Promise<AdminProduct> {
  const r = await fetch(`${base}/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { product: AdminProduct }
  return data.product
}

export async function restoreProduct(id: string): Promise<AdminProduct> {
  const r = await fetch(`${base}/api/admin/products/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: adminHeaders(),
  })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { product: AdminProduct }
  return data.product
}

export async function permanentlyDeleteProduct(id: string): Promise<void> {
  const r = await fetch(`${base}/api/admin/products/${encodeURIComponent(id)}/permanent`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
  if (!r.ok) throw new Error(await readError(r))
}

async function signCloudinaryUpload(filename: string): Promise<CloudinarySignResponse> {
  const r = await fetch(`${base}/api/admin/cloudinary/sign`, {
    method: 'POST',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename }),
  })
  if (!r.ok) throw new Error(await readError(r))
  return (await r.json()) as CloudinarySignResponse
}

export async function uploadProductImage(file: File): Promise<UploadProductImageResult> {
  const signed = await signCloudinaryUpload(file.name)
  const fd = new FormData()
  fd.append('file', file)
  fd.append('api_key', signed.apiKey)
  fd.append('timestamp', String(signed.timestamp))
  fd.append('signature', signed.signature)
  fd.append('folder', signed.folder)
  fd.append('overwrite', 'true')
  if (signed.publicId) {
    fd.append('public_id', signed.publicId)
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`
  const r = await fetch(uploadUrl, {
    method: 'POST',
    body: fd,
  })
  if (!r.ok) {
    throw new Error('Cloudinary upload failed')
  }
  const data = (await r.json()) as { public_id?: string; secure_url?: string }
  if (!data.public_id) {
    throw new Error('Cloudinary upload did not return public_id')
  }
  return {
    publicId: data.public_id,
    /** Use for `<img src>`; DB should still store `publicId` only. */
    secureUrl: data.secure_url ?? '',
  }
}


export async function loginAdmin(email: string, password: string): Promise<{ token: string; user: AdminAuthUser }> {
  const r = await fetch(`${base}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) throw new Error(await readError(r))
  return (await r.json()) as { token: string; user: AdminAuthUser }
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const r = await fetch(`${base}/api/admin/users`, { headers: adminHeaders() })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { users: AdminUser[] }
  return data.users
}

export async function createAdminUser(body: {
  email: string
  fullName: string
  password: string
  role: AdminUserRole
}): Promise<AdminUser> {
  const r = await fetch(`${base}/api/admin/users`, {
    method: 'POST',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { user: AdminUser }
  return data.user
}

export async function updateAdminUser(
  id: string,
  body: Partial<{ fullName: string; role: AdminUserRole; active: boolean; password: string }>,
): Promise<AdminUser> {
  const r = await fetch(`${base}/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { user: AdminUser }
  return data.user
}
