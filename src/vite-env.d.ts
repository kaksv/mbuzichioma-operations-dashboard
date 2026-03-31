/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ADMIN_API_KEY?: string
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string
  readonly VITE_CLOUDINARY_IMAGE_TRANSFORM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
