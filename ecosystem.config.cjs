// PM2 ecosystem config for the spare-computer deployment.
// Manages the backend API + the ngrok tunnel as a single unit.
//
// Usage on the spare (from the project root):
//   pm2 start ecosystem.config.cjs    # start both processes
//   pm2 restart all                   # restart both
//   pm2 stop all                      # stop both
//   pm2 save                          # snapshot for auto-start on reboot
//
// This file is a .cjs because the project's package.json has "type": "module",
// and PM2 expects this file to be CommonJS.

module.exports = {
  apps: [
    {
      // PocketBase: a single self-contained binary that runs as its own
      // HTTP server (default :8090) and stores everything in pb_data/.
      // The Express API (craniaverse-api) talks to it via the JS SDK.
      // The binary is downloaded per-machine — see server/POCKETBASE_SETUP.md.
      name: 'craniaverse-pocketbase',
      script: './server/pocketbase.exe',
      args: 'serve --http=127.0.0.1:8090',
      cwd: './server',
      autorestart: true,
      max_memory_restart: '512M',
      min_uptime: 10000,
      max_restarts: 10,
    },
    {
      name: 'craniaverse-api',
      script: 'server/server.js',
      env: {
        NODE_ENV: 'production',
        ALLOWED_FRAME_ANCESTORS: "'self' https://crania-schools.com https://www.crania-schools.com",
      },
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      // Continuous smoke tests. Runs once per fire (autorestart:false)
      // and PM2 re-fires it on the cron schedule below. Tests hit the
      // local API at port 4000 and a headless Chromium against the
      // same. On failure, writes to tests/logs/ AND emails the
      // operator (if TEST_NOTIFY_EMAIL is set).
      //
      // One-time setup on maya-pc:
      //   cd tests && npm install && npx playwright install chromium
      name: 'craniaverse-tests',
      script: './tests/run.js',
      cwd: './',
      cron_restart: '*/15 * * * *', // every 15 minutes
      autorestart: false,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      // Admin tunnel — serves the CraniaVerse React admin.
      // ngrok was installed as the Microsoft Store / MSIX package, which lives at
      // C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\ngrok.exe as a shell
      // reparse point — not a real PE binary, so PM2 can't CreateProcess it
      // directly. Wrap with cmd.exe, which knows how to resolve execution aliases.
      //
      // We deliberately use ONE domain per tunnel: `ngrok http` in v3 doesn't
      // reliably bind multiple --url flags on a single tunnel (only the first
      // binds, the rest stay offline). Add another PM2 entry per additional
      // hostname — both tunnels forward to the same local port 4000, so the
      // same Express app answers both. Host-based routing inside server.js
      // (SIGNUP_HOSTS) decides what each hostname gets to see.
      name: 'craniaverse-tunnel',
      script: 'cmd.exe',
      // --log=stdout switches ngrok off the interactive TUI dashboard and into
      // a daemon mode that writes structured logs to stdout. Without it, ngrok
      // tries to render the dashboard, fails (no TTY under PM2), and exits.
      args: '/c ngrok http 4000 --url=craniaverse.ngrok.app --log=stdout --log-format=logfmt --log-level=info',
      autorestart: true,
      min_uptime: 10000,
      // 2026-08-05 incident: a transient ngrok/network hiccup on boot burned
      // through max_restarts:10 in minutes, so PM2 gave up and left the
      // tunnel "errored" for hours with no one aware. Raised to 200 (PM2's
      // restart counter is cumulative across the process's life, so this is
      // a large budget, not "200 restarts per incident") and paired with
      // exp_backoff_restart_delay so repeated failures back off instead of
      // hammering. craniaverse-tunnel-monitor now emails if it ever does
      // exhaust the budget and lands back in "errored".
      max_restarts: 200,
      exp_backoff_restart_delay: 5000,
    },
    {
      // Public sign-up tunnel — serves the booth kiosk on a separate
      // hostname. The host-guard in server.js sends this hostname only
      // to the sign-up form + POST /api/booth-signup; everything else
      // 404s so the admin UI is invisible from this domain.
      //
      // Set SIGNUP_HOSTS=crania-signup.ngrok.app in server/.env so
      // the guard knows to apply to this hostname.
      name: 'craniaverse-signup-tunnel',
      script: 'cmd.exe',
      args: '/c ngrok http 4000 --url=crania-signup.ngrok.app --log=stdout --log-format=logfmt --log-level=info',
      autorestart: true,
      min_uptime: 10000,
      max_restarts: 10,
    },
  ],
}
