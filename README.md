# Mbuzi Chioma Admin

Independent admin frontend for Mbuzzi Choma, scaffolded with Vite + React + TypeScript + Tailwind CSS.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Environment

Create `.env` from `.env.example`:

- `VITE_API_BASE_URL`
  - Leave empty for local dev if you proxy `/api` in `vite.config.ts`.
  - Set to production API origin for deployed builds.

- `VITE_CLOUDINARY_CLOUD_NAME` (optional)
- `VITE_CLOUDINARY_IMAGE_TRANSFORM` (optional)
