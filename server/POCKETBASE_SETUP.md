# PocketBase setup (maya-pc, one-time)

Run these steps once on maya-pc, in the order shown. After this, the
existing PM2 workflow (`pm2 restart all`, `pm2 save`) manages PocketBase
alongside the API and ngrok.

## 1. Download the PocketBase binary

PocketBase is a single self-contained executable. Download the latest
**Windows amd64** build from https://pocketbase.io/docs and extract
`pocketbase.exe` into the `server/` folder of this repo on maya-pc:

```
C:\Users\CraniaVerse\craniaverse\server\pocketbase.exe
```

The binary is git-ignored (see `server/.gitignore`) — it lives on
maya-pc only.

## 2. Start PocketBase once to create the admin account

From the `server/` folder:

```powershell
.\pocketbase.exe serve --http=127.0.0.1:8090
```

The first run prints a URL like
`http://127.0.0.1:8090/_/#/pbinstal/<token>`. Open it in a browser to
create the **superuser** account. Pick an email and password and write
them down — they go into `.env` next.

When you have the account, stop PocketBase (Ctrl+C).

## 3. Fill in `server/.env`

Open (or create) `server/.env` and add:

```
PB_URL=http://127.0.0.1:8090
PB_ADMIN_EMAIL=<the email you chose>
PB_ADMIN_PASSWORD=<the password you chose>
```

Keep the existing `SENDGRID_API_KEY` etc. as-is.

## 4. Install the new Node dependency

From the `server/` folder:

```powershell
npm install
```

This pulls in the `pocketbase` JS SDK that the API and the setup script
use.

## 5. Start PocketBase again, then run the setup script

In one terminal:

```powershell
cd C:\Users\CraniaVerse\craniaverse\server
.\pocketbase.exe serve --http=127.0.0.1:8090
```

In a second terminal, from the same folder:

```powershell
npm run pb-setup
```

This:
- creates the six collections (registrations, staff, programs, rules,
  comments, staffBoard)
- imports everything currently in `data.json`, `staff.json`,
  `programs.json`, `rules.json`, `comments.json`, `staff-board.json`
  into PocketBase

The script is idempotent — safe to re-run. Existing records are matched
by their original id and updated in place rather than duplicated.

## 6. Hand control over to PM2

Stop the manually-started PocketBase (Ctrl+C in its terminal), then:

```powershell
pm2 restart ecosystem.config.cjs
pm2 save
```

PM2 now runs three processes: `craniaverse-pocketbase`,
`craniaverse-api`, and `craniaverse-tunnel`. Confirm with `pm2 status`.

## 7. Verify

- The admin UI is reachable at http://127.0.0.1:8090/_/ on maya-pc
  (login with the PB_ADMIN_EMAIL/PASSWORD). You should see all six
  collections populated.
- The React admin at https://craniaverse.ngrok.app/ should look and
  behave identically to before — the Express API talks to PocketBase
  under the hood.

## Notes

- The `*.json` files in `server/` (data.json, staff.json, etc.) are
  no longer the source of truth — PocketBase is. They're left in place
  as a backup of the pre-migration state. Once you're confident the
  migration is good, you can delete them.
- To re-import the JSON files later (e.g. for a fresh dev setup), just
  re-run `npm run pb-setup`.
- The PocketBase admin UI is the easiest way to inspect/edit data
  outside the app.
