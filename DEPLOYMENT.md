# CraniaVerse Deployment Guide

## Overview

CraniaVerse is a full-stack app with:
- **Frontend:** React app (built to `/dist` via Vite)
- **Backend:** Node/Express server that serves the frontend + provides APIs

## Quick Start (Production Deploy)

### 1. Clone and install dependencies
```bash
git clone https://github.com/craniaadmin/craniaverse.git
cd craniaverse
npm install
npm --prefix server install
```

### 2. Build the React frontend
This step is **required** because the built files (`dist/`) are not in git.
```bash
npm run build
```

### 3. Start the server
```bash
npm --prefix server start
```

The app will be available at `http://localhost:4000`.

---

## Using PM2 (Recommended for persistent deployment)

If you want the app to auto-restart on reboot and run both the backend API and ngrok tunnel:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

This uses the config in `ecosystem.config.cjs`, which manages:
- `craniaverse-api` → backend server on port 4000
- `craniaverse-tunnel` → ngrok tunnel (optional, for remote access)

---

## Troubleshooting

### App shows a blank page or 404
**Cause:** The `dist/` folder doesn't exist.  
**Fix:** Run `npm run build` to build the React app.

### API endpoints return 404
**Cause:** The backend server isn't running or isn't on the expected port.  
**Fix:** 
- Ensure `npm --prefix server start` is running
- Check that port 4000 is available (`lsof -i :4000` on Mac/Linux)

### Data files not persisting
The backend stores data in JSON files in the `server/` directory:
- `server/data.json` — registration records
- `server/comments.json` — student comments
- `server/rules.json` — behavior point rules
- `server/staff.json` — staff directory
- `server/programs.json` — program offerings
- `server/staff-board.json` — Trello-style board

These are gitignored to avoid storing personal data. They'll be created automatically when the server first runs.

---

## Environment Variables

### VITE_API_URL (Frontend)
Controlled via `.env.production`:
```
VITE_API_URL=
```
Empty string = use same origin (works when frontend + backend are served together)

### ALLOWED_FRAME_ANCESTORS (Backend)
Set in `ecosystem.config.cjs` or at runtime:
```javascript
ALLOWED_FRAME_ANCESTORS="'self' https://crania-schools.com https://www.crania-schools.com"
```
Controls which sites can embed `/register` and `/staff-form` in an iframe.

---

## API Endpoints

All API endpoints are prefixed with `/api`:
- `GET /api/health` — health check
- `GET /api/registrations` — list all registrations
- `POST /api/registrations` — create a registration (from public form)
- `GET /api/staff` — list staff
- `GET /api/programs` — list programs
- `GET /api/rules` — list behavior point rules
- `GET /api/comments/:studentId` — student comments
- ... and more (see `server/server.js` for full list)

---

## Production Checklist

- [ ] `npm install` && `npm --prefix server install`
- [ ] `npm run build` creates `/dist`
- [ ] Backend server starts with no errors
- [ ] Access app at `http://localhost:4000`
- [ ] Data persists after restart
- [ ] PM2 configured if you want auto-restart on reboot
- [ ] Firewall allows traffic on port 4000 (or your configured PORT)
