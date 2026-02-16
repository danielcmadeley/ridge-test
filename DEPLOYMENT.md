# Deployment Guide

This project is split into:

- `web/` (React/TanStack Start frontend) deployed to Cloudflare Workers.
- `backend/` (FastAPI API) deployed to Railway.

## 1) Deploy backend to Railway

From Railway, create a new service from this repository and set the service root to `backend/`.

The backend is deployment-ready with:

- `backend/Dockerfile` (containerized build/runtime)
- `backend/Procfile` (fallback start command)

Environment variables to set in Railway:

- `CORS_ORIGINS=https://<your-cloudflare-worker-domain>`

Notes:

- Add multiple origins as a comma-separated list.
- Use `*` only if you intentionally want open CORS.
- Healthcheck endpoint is available at `/health`.

After deploy, copy your Railway public URL (for example `https://your-api.up.railway.app`).

## 2) Deploy frontend to Cloudflare Workers

In Cloudflare, create a Worker and connect this repository, using `web/` as the working directory.

Build/deploy commands:

- Install: `npm install`
- Build: `npm run build`
- Deploy: `npm run deploy`

Set frontend environment variable:

- `VITE_API_BASE_URL=https://<your-railway-backend-domain>`

For local development, `web/.env` defaults to `http://localhost:8000`.

## 3) Post-deploy verification

1. Open backend URL + `/health` and confirm `{ "status": "ok" }`.
2. Open frontend URL and run a sample analysis.
3. Confirm API requests from frontend target Railway URL.
4. If requests fail with CORS, update `CORS_ORIGINS` in Railway and redeploy.
