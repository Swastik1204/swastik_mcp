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
PORT=4000
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
# Backend (port 4000)
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
- **CORS**: Locked to `swastikmcp.web.app`, `localhost:5173`, `localhost:4000`
- **Rate limiting**: 100 req/min general, 30 req/min for writes
- **Audit log**: All delete/restore operations logged in SQLite `audit_log` table + Firestore `logs` collection
- **Tombstones**: Entries are never hard-deleted; tombstone flags allow forensic inspection and restoration

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
