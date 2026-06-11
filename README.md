# CraniaVerse — Administration App

A standalone React (Vite) admin application for **Crania Schools**, rebuilt from the
PowerPoint mockup. It reproduces the navigation structure and every mocked screen as a
working, interactive single-page app.

## Screens included

| Section | Screen | Notes |
|---|---|---|
| (entry) | **Login** | Email / password, show-hide toggle |
| Admin | **Dashboard** | Revenue gauge, program bar chart, registrations vs. cancellations line chart, status cards |
| Admin | **Calendar** | Month view with Day School / Afterschool / Personal filters |
| Admin | **To Do** | Colour-coded priorities (1–4), check off tasks, add rows, hide completed |
| Admin | **Schedules** | Two-location teaching grid (Boardwalk / Waterloo East) |
| Customers | **Customers** | Student + Guardian 1 + Guardian 2 + Emergency Contact |
| Customers | **Surveys** | 14-step survey stepper |
| Students | **Students** | Student info, Notes, Assessments, Login, Crania Cash |
| Programs | **Programs** | Category / Subject / Code / Title / Schedule / Fees table |
| Financial | **Fee Schedules** | Interactive fee-schedule calculator |

Other nav items (Contests, Staff, Operations, Marketing, etc.) render a tidy
placeholder ready to be wired to real data.

## Tech stack

- **React 18** + **Vite 5**
- **recharts** — dashboard charts
- **lucide-react** — icons
- Plain CSS with design tokens in `src/index.css` (no build-time CSS framework, so nothing extra to configure)

## Run it (in VSCode or any terminal)

> Requires **Node.js 18+** (LTS recommended).

```bash
# 1. install dependencies
npm install

# 2. start the dev server (opens http://localhost:5173)
npm run dev
```

Then sign in on the login screen (any email/password works — it's a front-end demo)
and explore via the top navigation.

### Build for production

```bash
npm run build      # outputs to /dist
npm run preview    # serve the production build locally
```

## Project structure

```
craniaverse/
├─ index.html
├─ package.json
├─ vite.config.js
├─ public/favicon.png
└─ src/
   ├─ main.jsx            # React entry
   ├─ App.jsx             # auth + page routing
   ├─ index.css           # design system / all styles
   ├─ data/mockData.js    # sample data for every screen
   ├─ components/         # BrandMark, TopNav, Login, FooterBand
   └─ pages/              # Dashboard, ToDo, Calendar, Schedules,
                          #   Customers, Students, Programs,
                          #   FeeSchedule, Surveys, Placeholder
```

## Customizing

- **Brand colours** live as CSS variables at the top of `src/index.css`.
- **Sample content** is all in `src/data/mockData.js` — swap it for API calls when you connect a backend.
- **Navigation** is defined by the `NAV` array in `mockData.js`; add or rename items there.

## Logo

The official **Crania Schools** logo is in `src/assets/` (`crania-logo.jpg`, plus a
`crania-logo-transparent.png` with the black background removed). It's displayed via
`src/components/BrandMark.jsx`, which both the top navigation and the login screen use.
The artwork is designed for a dark background, so it's shown on a rounded dark tile.
To swap in a different logo later, replace the file in `src/assets/` and keep the import name.

## Live registration → Students + Customers (added)

A new **Registration** screen (top nav → *Customers ▸ Registration*) rebuilds the
public registration form inside the app. On submit it creates **one linked record**:

- a **Student** entry (shown on the Students page), and
- a **Customer** entry (shown on the Customers page),

mapped from the same submission and sharing one id. New records are appended to a
small shared store (`src/data/store.jsx`, a React Context) and persisted to
`localStorage`, so they survive a page refresh. The Students and Customers pages now
show a **record picker** so you can switch between records; the seed record
(Hobo Karim) is still there on first load. Call `resetToSeed()` from the store to
clear demo data.

**Where the wiring lives**
- `src/data/store.jsx` — the store, `registrationToRecord()` field mapping, persistence.
- `src/pages/Registration.jsx` — the form + validation + success screen.
- `src/components/RecordPicker.jsx` — the record selector chips.
- `src/App.jsx` — wraps the app in `<StoreProvider>` and routes `Registration`.

To connect a real backend later, replace the body of `addRegistration` (POST to your
API) and `loadInitial` (GET your records) in `store.jsx`.

---

## Running the full system (app + registration backend)

Registrations now flow through a small **Node API** (in `server/`) that stores
submissions in a JSON file. Both the public form and the in-app form POST to it,
and the admin app reads from it — so a registration on your website shows up in
Students and Customers. You run **two processes** locally.

### Terminal 1 — the API
```bash
cd server
npm install      # first time only (installs express + cors)
npm run dev      # listens on http://localhost:4000 (auto-restarts on changes)
# or: npm start  # no auto-restart
```
On first run it creates `server/data.json` seeded with the demo record (Hobo Karim).

### Terminal 2 — the admin app
```bash
npm install      # first time only
npm run dev      # http://localhost:5173
```
Open the app, go to **Customers ▸ Students** — the record picker shows a green
"Connected" dot when it can reach the API. New registrations appear automatically
(the app re-checks every 15s) or immediately via the **Refresh** button.

### Exposing the registration form publicly via ngrok

The registration form is served by the API at `/register` and can be made accessible
over the internet using **ngrok**.

1. [Install ngrok](https://ngrok.com/download) and log in (`ngrok config add-authtoken <token>`).
2. Start the API (Terminal 1 above) so it's running on port 4000.
3. In a third terminal, start the ngrok tunnel pointing at port 4000:
   ```bash
   ngrok http --url=register.craniaschools.com 4000
   ```
   The static domain keeps the URL stable across restarts. The form will be live at:
   ```
   https://register.craniaschools.com/register
   ```
4. Submissions go directly into `server/data.json` and appear in the admin app.

> If you don't have the static domain claimed yet, run `ngrok http 4000` instead —
> ngrok will assign a temporary URL. Claim your free static domain at
> [dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains).

### The public registration form
`registration.html` (delivered separately) is the standalone page for your website.
Its `CONFIG.ENDPOINT` is already set to `http://localhost:4000/api/registrations`.
Serve it over http (not opened as a `file://`) so the browser allows the cross-origin
POST — e.g. drop it in `public/` and visit `http://localhost:5173/registration.html`,
or host it on your site and point `ENDPOINT` at wherever the API is reachable.

> The API URL the admin app uses can be overridden by creating a `.env` file with
> `VITE_API_URL=http://your-host:4000`.

### Going to production later
The API currently has no authentication and stores to a flat file — fine for local
use. Before exposing it publicly, add auth on the write endpoint, run it behind HTTPS,
and consider swapping the JSON file for a real database (the storage functions in
`server/server.js` are the only place to change).
