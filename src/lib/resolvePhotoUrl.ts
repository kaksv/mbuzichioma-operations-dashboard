/**
 * Mirrors the storefront helper: turn stored public_ids (or legacy paths) into
 * Cloudinary HTTPS URLs. Full `https://...` values pass through.
 */

function legacyChomaPathToPublicId(path: string): string | null {
  const m = path.trim().match(/^\/choma\/([^/.]+)\.[a-z0-9]+$/i)
  return m ? `mbuzzi-choma/${m[1]}` : null
}

export function resolveProductPhotoUrl(stored: string): string {
  const t = stored.trim()
  if (!t) return t
  if (/^https?:\/\//i.test(t)) return t

  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim()
  if (!cloud) {
    return t
  }

  let publicId: string
  if (t.startsWith('/')) {
    const mapped = legacyChomaPathToPublicId(t)
    if (!mapped) return t
    publicId = mapped
  } else {
    publicId = t
  }

  const transform =
    import.meta.env.VITE_CLOUDINARY_IMAGE_TRANSFORM?.trim() || 'f_auto,q_auto'
  const transformSeg = transform ? `${transform}/` : ''
  return `https://res.cloudinary.com/${cloud}/image/upload/${transformSeg}${publicId}`
}
