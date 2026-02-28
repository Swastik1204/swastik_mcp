# ⚡ Swastik MCP — Personal MCP Brain

A standalone **Model Context Protocol** (MCP) system with:
- **Backend API** (Express.js) — memory CRUD, tombstone delete/restore, sync, tool registry, AI routing
- **Firebase Auth** — real authentication on backend + dashboard
- **Firebase Firestore** — cloud memory store with tombstone fields
- **SQLite** — offline cache with revision tracking + dead-letter queue
- **Tombstone-aware sync engine** — incremental pull, revision wins, resurrection prevention
- **MCP compatibility layer** — STDIO + HTTP transport for Claude Desktop / VS Code
- **React dashboard** (Vite + TailwindCSS + daisyUI) — delete/restore UI, show-deleted toggle
- **Local device agent** — automated sync

---

## 📁 Project Structure

```
swastik_mcp/
├── backend/
│   ├── src/
│   │   ├── index.js           # Entry point — CORS, auth, rate limiting
│   │   ├── config/firebase.js # Firebase Admin SDK init
│   │   ├── db/sqlite.js       # SQLite cache — tombstones, audit log, devices
│   │   ├── middleware/
│   │   │   ├── auth.js        # Firebase Auth token verification
│   │   │   └── rateLimiter.js # express-rate-limit (100/min, 30/min writes)
│   │   ├── routes/
│   │   │   ├── health.js      # GET /api/health
│   │   │   ├── memory.js      # CRUD + DELETE + RESTORE (global + project)
│   │   │   ├── sync.js        # push, pull, status, retry-dead-letters
│   │   │   ├── tools.js       # Tool registry (stubs)
│   │   │   └── ai.js          # AI router (stubs)
│   │   ├── sync/engine.js     # Tombstone-aware two-way sync
│   │   └── mcp/server.js      # MCP protocol — HTTP router + STDIO transport
│   ├── data/                  # SQLite database (gitignored)
│   └── .env
├── dashboard/
│   ├── src/
│   │   ├── App.jsx            # Firebase Auth state listener
│   │   ├── pages/             # GlobalMemory, ProjectMemory, Devices, Logs, Tools
│   │   ├── components/        # Sidebar, Navbar
│   │   └── services/
│   │       ├── firebase.js    # Firebase client config (env vars)
│   │       └── api.js         # API helper with auth tokens
│   └── .env
├── agent/                     # Local device agent
├── docs/firestore-schema.md   # Firestore schema with tombstone fields
├── firebase.json              # Firebase Hosting config (SPA)
├── render.yaml                # Render deployment blueprint
└── README.md
```

---

## 🚀 Local Setup

### Prerequisites
- **Node.js** ≥ 18
- **Firebase project** with Auth (email/password) enabled
- **Firebase service account** key JSON

### 1. Clone & install

```powershell
git clone https://github.com/Swastik1204/swastik_mcp.git
cd swastik_mcp
cd backend; npm install; cd ..
cd dashboard; npm install; cd ..
cd agent; npm install; cd ..
```

### 2. Configure environment

**`backend/.env`**:
```env
PORT=3939
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-key.json
OWNER_UID=<your-firebase-auth-uid>
DEVICE_ID=backend-local
```

**`dashboard/.env`**: Set all `VITE_FIREBASE_*` values from your Firebase console.

### 3. Create a Firebase Auth user

Go to Firebase Console → Authentication → Add user. Copy the UID into `OWNER_UID`.

---

## ▶️ Running

```powershell
# Backend (port 3939)
cd backend; npm run dev

# Dashboard (port 5173, proxied to backend)
cd dashboard; npm run dev

# Agent (optional — automated sync loop)
cd agent; npm start
```

---

## 🔌 API Endpoints

All routes except `/api/health` require a Firebase Auth `Bearer` token in the `Authorization` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check |
| GET | `/api/memory/global` | Yes | List global memory (`?includeDeleted=true`) |
| GET | `/api/memory/global/:key` | Yes | Get one entry |
| POST | `/api/memory/global` | Yes | Set `{ key, value }` |
| DELETE | `/api/memory/global/:key` | Owner | Tombstone delete |
| POST | `/api/memory/global/:key/restore` | Owner | Restore tombstoned entry |
| GET | `/api/memory/project/:id` | Yes | List project memory |
| POST | `/api/memory/project/:id` | Yes | Set `{ key, value }` |
| DELETE | `/api/memory/project/:id/:key` | Owner | Tombstone delete |
| POST | `/api/memory/project/:id/:key/restore` | Owner | Restore |
| POST | `/api/sync/push` | Yes | Push offline queue to Firebase |
| POST | `/api/sync/pull` | Yes | Incremental pull (`?deviceId=`) |
| GET | `/api/sync/status` | Yes | Queue depth + dead letters |
| POST | `/api/sync/retry-dead-letters` | Owner | Retry dead-letter items |
| GET | `/api/mcp/info` | Yes | MCP server info |
| GET | `/api/mcp/tools` | Yes | List MCP tools |
| POST | `/api/mcp/tools/call` | Yes | Call MCP tool `{ name, arguments }` |
| POST | `/api/mcp/clients/:id/launch` | Yes | One-click MCP client setup helper (open app/folder/copy config) |
| POST | `/api/mcp/clients/:id/reconnect` | Yes | Reconnect MCP client and re-test health |
| GET | `/api/health/mcp` | No | MCP self-test + diagnostics payload |
| GET | `/api/health/telegram` | No | Telegram control-bot health snapshot |
| GET | `/api/admin/status` | Secret + allowed chat | Telegram-friendly backend/MCP/sync snapshot |
| POST | `/api/admin/telegram/ping` | Secret + allowed chat | Mark bot heartbeat and last command |
| POST | `/api/admin/restart-backend` | Secret + owner chat | Trigger safe backend restart/deploy hook |

---

## 🧠 MCP Integration (Claude Desktop / VS Code)

### STDIO Transport

Add to `~/.config/claude/claude_desktop_config.json` (or VS Code MCP settings):

```json
{
  "mcpServers": {
    "swastik-brain": {
      "command": "node",
      "args": ["D:/My projects/swastik_mcp/backend/src/mcp/server.js", "--stdio"],
      "env": {
        "FIREBASE_SERVICE_ACCOUNT_PATH": "./firebase-key.json"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `read_memory` | Read a key from global or project scope |
| `write_memory` | Write/update a memory entry |
| `delete_memory` | Tombstone-delete (reversible) |
| `restore_memory` | Restore a tombstoned entry |
| `list_memory` | List all keys in a scope |
| `list_memories_filtered` | Filter by project, tag, importance, deleted state |
| `search_memories` | Free-text search across memory content |
| `add_freeform_memory` | Add manual memory with tags/importance/pin metadata |
| `visualize_memory_summary` | Counts by project/tag + recent edits + deleted count |

---

## ⚙️ One-Click MCP Setup

The dashboard MCP wizard now supports one-click setup for:
- Claude Desktop
- VS Code MCP client
- Continue
- Cursor
- ChatGPT MCP
- Gemini MCP
- Antigravity
- Stitch
- Generic MCP

### Port and endpoint invariant

- Local API base: `http://localhost:3939/api`
- Local MCP endpoint: `http://localhost:3939/api/mcp`
- Production API base: `https://<render-backend>.onrender.com/api`
- Production MCP endpoint: `https://<render-backend>.onrender.com/api/mcp`

Dashboard setup snippets use `VITE_API_BASE_URL`, with fallback to `http://localhost:3939/api`.

### Safety behavior

- The launcher can open your client app and config folder and attempt clipboard copy.
- No automatic filesystem writes are performed.
- You always paste configuration manually.

### OS support notes

- Windows: app/folder open via `start` / `explorer`, clipboard via `Set-Clipboard`
- macOS: app/folder open via `open`, clipboard via `pbcopy`
- Linux: app/folder open via `xdg-open`, clipboard via `xclip` if available
- If auto-open fails, the API returns fallback instructions.

---

## 📝 Manual Memory

The dashboard includes **Add Memory Manually**:
- Free-form text entry
- Optional tags
- Scope selector (global or project)
- Importance (`low` / `medium` / `high`)
- Pin flag
- Optional custom key (auto-generated if omitted)

Writes reuse existing memory APIs and revision/sync semantics.

---

## 🧠 Brain View

The dashboard includes a graph-based **Brain View**:
- Nodes represent memory entries
- Tag nodes connect related memories
- Filters for project, tag, importance, deleted state
- Search, zoom/pan, and hover preview
- Detail panel supports edit/delete/restore (owner-only rules remain enforced by backend)

### MCP Resources

| URI | Description |
|-----|-------------|
| `memory://global` | All global memory entries |
| `memory://projects` | List of project IDs |
| `memory://project/{id}` | All entries for a project |

---

## 🔄 Sync Architecture

```
┌─────────────┐     write      ┌─────────────┐     push      ┌──────────────┐
│  Dashboard / │ ──────────────►│   SQLite     │ ────────────► │   Firebase   │
│  MCP Client  │                │  (offline    │               │  (cloud      │
│              │ ◄──────────────│   cache)     │ ◄──────────── │   store)     │
└─────────────┘     read        └─────────────┘   inc. pull    └──────────────┘
```

### Key invariants:
1. **Offline-first** — writes go to SQLite immediately, queued for Firebase
2. **Revision wins** — higher revision number always overwrites lower
3. **Tombstones propagate** — deleted entries propagate across devices, never resurrected by stale data
4. **Incremental pull** — per-device `last_sync` cursor, only fetches changed docs
5. **Dead-letter queue** — failed sync items (≥ 5 retries) are parked, retried manually

---

## 🔒 Security

- **Authentication**: Firebase Auth ID tokens verified by backend middleware
- **Authorization**: Delete/restore operations require `OWNER_UID` match
- **CORS**: Locked to `swastikmcp.web.app`, `localhost:5173`, `localhost:3939`
- **Rate limiting**: 100 req/min general, 30 req/min for writes
- **Audit log**: All delete/restore operations logged in SQLite `audit_log` table + Firestore `logs` collection
- **Tombstones**: Entries are never hard-deleted; tombstone flags allow forensic inspection and restoration

---

## 🤖 Telegram Wake + MCP Health

### Bot runtime

- Bot lives in `telegram/` and runs as a separate process (`npm run dev:telegram`)
- Required env vars for bot:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_ALLOWED_CHAT_IDS`
  - `TELEGRAM_OWNER_CHAT_ID`
  - `BACKEND_HEALTH_URL` (e.g. `http://localhost:3939/api/health` or Render URL)
  - `BACKEND_ADMIN_SECRET`

### Supported Telegram commands

- `start` / `wake` → wake backend via `GET /api/health`
- `status` → full backend/MCP/sync summary
- `mcp` → MCP health summary
- `sync` → queue/dead-letter summary
- `logs` → last 5 logs (owner-only)
- `restart` → deploy hook restart (owner-only)
- `help` → command list

### Health payload contracts

`GET /api/health/mcp`

```json
{
  "ok": true,
  "http": true,
  "stdio_supported": true,
  "tools_registered": 14,
  "resources_registered": 3,
  "last_tool_call_at": "2026-02-28T12:00:00.000Z",
  "port": 3939,
  "env": "local"
}
```

`GET /api/health/telegram`

```json
{
  "ok": true,
  "bot_connected": true,
  "last_ping_at": "2026-02-28T12:00:05.000Z",
  "allowed_chat_ids": ["123456789"],
  "can_restart_backend": true
}
```

### End-to-end validation checklist

#### Local

1. Start backend on `3939`: `cd backend && npm run dev`
2. Verify MCP health: `GET http://localhost:3939/api/health/mcp`
3. Verify Telegram health: `GET http://localhost:3939/api/health/telegram`
4. Connect Claude Desktop via HTTP MCP to `http://localhost:3939/api/mcp`
5. Call any MCP tool and confirm `last_tool_call_at` updates
6. Start telegram bot: `cd telegram && npm install && npm start`
7. Send `status` and confirm response includes queue/dead-letter values

#### Production (Render + Firebase Hosting)

1. Allow Render backend to sleep
2. Send Telegram `start` command (wake ping)
3. Confirm Render backend becomes healthy
4. Connect MCP client to `https://<render-service>.onrender.com/api/mcp`
5. Run `read_memory` and verify dashboard health badges update
6. Send `status`, `mcp`, and (owner-only) `restart`

### Failure-mode handling

- Bot up, backend down → bot returns `Wake failed` / `Status failed` without crashing
- Backend up, MCP degraded → `/api/health/mcp` returns `ok` with degraded flags
- Expired Firebase token (HTTP MCP) → request rejected by auth middleware
- Unauthorized Telegram chat → rejected by `allowed_chat_ids`
- Owner-only command from non-owner → rejected (`Forbidden`)
- Render deploy hook failure → restart endpoint returns explicit error status
- Misconfigured port (5173 vs 3939) → health endpoints reveal actual backend port
- Telegram command spam → per-chat rate limiting in bot handler

### Deployment notes

- Render backend env: set `BACKEND_ADMIN_SECRET`, `TELEGRAM_ALLOWED_CHAT_IDS`, `TELEGRAM_OWNER_CHAT_ID`, optional `RENDER_DEPLOY_HOOK_URL`
- Bot host: run `telegram/` in an always-on worker/runtime (not on sleeping web service)
- Keep `ALLOW_PROCESS_SELF_RESTART=false` in production unless explicitly needed

---

## 🚀 Deploying

### Firebase Hosting (Dashboard)
```powershell
cd dashboard; npm run build; cd ..
firebase deploy --only hosting
```

### Render (Backend)
1. Push to GitHub
2. Connect repo at [render.com/blueprints](https://dashboard.render.com/blueprints)
3. Set env vars: `FIREBASE_SERVICE_ACCOUNT_JSON`, `OWNER_UID`, `DEVICE_ID=render-backend`
4. Set dashboard env vars: all `VITE_FIREBASE_*` + `VITE_API_BASE_URL`

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js, express-rate-limit |
| Cloud DB | Firebase Firestore |
| Local DB | SQLite (better-sqlite3) |
| Auth | Firebase Auth (email/password) |
| Frontend | React (Vite), TailwindCSS, daisyUI |
| MCP | Custom STDIO + HTTP server |
| AI Router | Claude / ChatGPT / Gemini (stubs) |
| Deploy | Firebase Hosting + Render |

---

## 📝 License

MIT — Built by Swastik
