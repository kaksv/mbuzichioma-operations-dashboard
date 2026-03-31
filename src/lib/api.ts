const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

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
}

export type AdminOrder = {
  id: string
  packageId: string
  packageTitle: string
  unitPriceUGX: number
  quantity: number
  totalUGX: number
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

function adminHeaders(): HeadersInit {
  const key = import.meta.env.VITE_ADMIN_API_KEY?.trim()
  return key ? { 'x-admin-key': key } : {}
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
