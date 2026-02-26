# ⚡ Swastik MCP — Personal MCP Brain

A standalone **Model Context Protocol** (MCP) system with:
- **Backend API** (Express.js) for memory CRUD, sync, tool registry, and AI routing
- **Firebase Firestore** as cloud memory store
- **SQLite** as local offline cache
- **Two-way sync engine** (offline-first, push/pull when online)
- **React dashboard** (Vite + TailwindCSS + daisyUI)
- **Local device agent** for automated sync

---

## 📁 Project Structure

```
swastik_mcp/
├── backend/               # Express.js API server
│   ├── src/
│   │   ├── index.js       # Entry point
│   │   ├── config/        # Firebase admin init
│   │   ├── db/            # SQLite cache layer
│   │   ├── routes/        # API routes (health, memory, sync, tools, ai)
│   │   ├── sync/          # Two-way sync engine
│   │   ├── services/      # Business logic (future)
│   │   ├── middleware/    # Auth, logging (future)
│   │   ├── tools/         # Tool implementations (future)
│   │   └── ai/            # AI router logic (future)
│   ├── data/              # SQLite database (gitignored)
│   ├── package.json
│   └── .env
├── dashboard/             # Vite + React frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── pages/         # GlobalMemory, ProjectMemory, Devices, Logs, Tools
│   │   ├── components/    # Sidebar, Navbar
│   │   └── services/      # Firebase client config, API helpers
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── agent/                 # Local device agent
│   ├── index.js
│   └── package.json
├── tools/                 # External tool integrations (future)
├── docs/                  # Schema docs, architecture notes
│   └── firestore-schema.md
├── scripts/               # Utility scripts
├── render.yaml            # Render deployment blueprint
├── .env.example           # Template for environment variables
├── .gitignore
└── README.md
```

---

## 🚀 Local Setup (Windows PowerShell)

### Prerequisites
- **Node.js** ≥ 18 — [Download](https://nodejs.org/)
- **Git** — [Download](https://git-scm.com/)
- **Firebase project**

### 1. Clone the repo

```powershell
cd "D:\My projects"
git clone https://github.com/Swastik1204/swastik_mcp.git
cd swastik_mcp
```

### 2. Install backend dependencies

```powershell
cd backend
npm install
cd ..
```

### 3. Install dashboard dependencies

```powershell
cd dashboard
npm install
cd ..
```

### 4. Install agent dependencies

```powershell
cd agent
npm install
cd ..
```

### 5. Configure environment

```powershell
# Copy the example env file for the backend
Copy-Item .env.example backend\.env

# Copy dashboard env template
Copy-Item dashboard\.env.example dashboard\.env
```

Edit `backend\.env` and set:
- `FIREBASE_SERVICE_ACCOUNT_PATH` — path to your Firebase service account JSON
- `FIREBASE_SERVICE_ACCOUNT_JSON` — optional raw JSON string (preferred on Render)
- `FIREBASE_PROJECT_ID`

Edit `dashboard\.env` and set all `VITE_FIREBASE_*` values.

### 6. Set Firebase service account file path

Set this in `backend/.env` for local Windows usage:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=D:\Downloads\stocker-5213e-firebase-adminsdk-xght3-c15166ea6b.json
```

---

## ▶️ Running the Backend

```powershell
cd backend
npm run dev     # Uses nodemon for auto-reload
```

The API will be available at **http://localhost:4000**.

### Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/memory/global` | List global memory |
| POST | `/api/memory/global` | Set global memory `{ key, value }` |
| GET | `/api/memory/project/:id` | List project memory |
| POST | `/api/memory/project/:id` | Set project memory `{ key, value }` |
| POST | `/api/sync/push` | Push offline queue to Firebase |
| POST | `/api/sync/pull` | Pull cloud data to SQLite |
| GET | `/api/sync/status` | Pending sync count |
| GET | `/api/tools` | List registered tools |
| POST | `/api/ai/route` | Route prompt to AI model (stub) |

---

## ▶️ Running the Dashboard

```powershell
cd dashboard
npm run dev
```

Open **http://localhost:5173** in your browser.

- Login with any email/password (mock auth)
- API calls are proxied to the backend on `:4000`

---

## ▶️ Running the Agent

```powershell
cd agent
npm start
```

The agent will:
1. Check if the backend is online
2. Push any queued offline writes
3. Pull latest data from Firebase
4. Repeat every 60 seconds (configurable via `SYNC_INTERVAL_MS`)

---

## 🔄 How Sync Works

```
┌─────────────┐     write      ┌─────────────┐     push      ┌──────────────┐
│  Dashboard / │ ──────────────►│   SQLite     │ ────────────► │   Firebase   │
│  API Client  │                │  (offline    │               │  (cloud      │
│              │ ◄──────────────│   cache)     │ ◄──────────── │   store)     │
└─────────────┘     read        └─────────────┘     pull       └──────────────┘
```

1. **Offline-first**: All writes go to SQLite immediately
2. **Best-effort cloud write**: The API tries to write to Firebase; if it fails, the operation is added to `sync_queue`
3. **Push**: `POST /api/sync/push` flushes `sync_queue` to Firebase
4. **Pull**: `POST /api/sync/pull` downloads all Firebase data into SQLite
5. **Agent**: The device agent automates push + pull on a timer

---

## 🚀 Deploying to Render

When you're ready to deploy:

### 1. Push to GitHub

```powershell
git add .
git commit -m "Initial scaffold"
git push origin main
```

### 2. Connect to Render

1. Go to [render.com/blueprints](https://dashboard.render.com/blueprints)
2. Click **New Blueprint Instance**
3. Connect your GitHub repo: `https://github.com/Swastik1204/swastik_mcp`
4. Render reads `render.yaml` and creates:
   - **swastik-mcp-backend** — Node.js web service
   - **swastik-mcp-dashboard** — Static site

### 3. Set environment variables

In the Render dashboard, set these values manually:

Backend service (`swastik-mcp-backend`)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (paste full service account JSON as one line)
- `FIREBASE_SERVICE_ACCOUNT_PATH` (optional; only if you mount a key file path in Render)

Dashboard service (`swastik-mcp-dashboard`)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

### 4. Verify

- Backend health: `https://swastik-mcp-backend.onrender.com/api/health`
- Dashboard: `https://swastik-mcp-dashboard.onrender.com`

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js |
| Cloud DB | Firebase Firestore |
| Local DB | SQLite (better-sqlite3) |
| Frontend | React (Vite), TailwindCSS, daisyUI |
| Auth | Firebase Auth (mock for now) |
| AI Router | Claude / ChatGPT / Gemini (stubs) |
| Tools | Antigravity, Stitch (placeholders) |
| Deploy | Render.com |

---

## 📝 License

MIT — Built by Swastik
