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
      name: 'craniaverse-tunnel',
      // ngrok was installed as the Microsoft Store / MSIX package, which lives at
      // C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\ngrok.exe as a shell
      // reparse point — not a real PE binary, so PM2 can't CreateProcess it
      // directly. Wrap with cmd.exe, which knows how to resolve execution aliases.
      script: 'cmd.exe',
      // --log=stdout switches ngrok off the interactive TUI dashboard and into
      // a daemon mode that writes structured logs to stdout. Without it, ngrok
      // tries to render the dashboard, fails (no TTY under PM2), and exits.
      args: '/c ngrok http 4000 --url=craniaverse.ngrok.app --log=stdout --log-format=logfmt --log-level=info',
      autorestart: true,
      // Throttle restarts if ngrok keeps dying (e.g. account auth issue)
      min_uptime: 10000,
      max_restarts: 10,
    },
  ],
}
