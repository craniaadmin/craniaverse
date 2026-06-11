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
      name: 'craniaverse-api',
      script: 'server/server.js',
      env: {
        NODE_ENV: 'production',
        // Override frame-ancestors here if you change the school site domain.
        // ALLOWED_FRAME_ANCESTORS: "'self' https://crania-schools.com https://www.crania-schools.com",
      },
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      name: 'craniaverse-tunnel',
      // PM2 doesn't resolve via PATH, so use the absolute path to ngrok.exe.
      // Standalone ngrok.exe was downloaded from ngrok.com and dropped in the
      // spare host's user folder. Avoid the Microsoft Store / WindowsApps copy:
      // that's an execution alias, not a real binary, and PM2 can't launch it.
      script: 'C:\\Users\\CraniaVerse\\ngrok.exe',
      args: 'http 4000 --domain=uncork-silent-unengaged.ngrok-free.dev',
      autorestart: true,
      // Throttle restarts if ngrok keeps dying (e.g. account auth issue)
      min_uptime: 10000,
      max_restarts: 10,
    },
  ],
}
