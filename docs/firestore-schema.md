# Firestore Schema Design — Swastik MCP

## Collections

### `global_memory`
Top-level collection. Each document = one memory key.

```
global_memory/
  └── {key}                         ← doc ID = memory key
        ├── value    : any          ← the stored value (string, object, etc.)
        └── updated_at : timestamp  ← last modified
```

**Example:**
```
global_memory/preferred_stack
  value: { frontend: "React", backend: "Node.js" }
  updated_at: "2026-02-26T10:00:00Z"
```

---

### `project_memory`
Top-level collection. Each doc = a project. Sub-collection `entries` holds key-value pairs.

```
project_memory/
  └── {project_id}                 ← doc ID = project slug
        └── entries/               ← sub-collection
              └── {key}            ← doc ID = memory key
                    ├── value    : any
                    └── updated_at : timestamp
```

**Example:**
```
project_memory/swastik_mcp/entries/tech_stack
  value: { backend: "Express", db: "Firebase + SQLite" }
  updated_at: "2026-02-26T10:00:00Z"
```

---

### `users` (future — Firebase Auth ready)
```
users/
  └── {uid}
        ├── email       : string
        ├── displayName : string
        ├── role        : string   ("admin" | "viewer")
        ├── devices     : string[] (device IDs)
        └── created_at  : timestamp
```

---

### `devices`
```
devices/
  └── {device_id}
        ├── device_name : string
        ├── owner_uid   : string
        ├── last_sync   : timestamp
        ├── status      : string ("online" | "offline")
        └── platform    : string ("windows" | "macos" | "linux")
```

---

### `logs` (future)
```
logs/
  └── {auto_id}
        ├── level     : string  ("info" | "warn" | "error")
        ├── message   : string
        ├── source    : string  ("backend" | "agent" | "dashboard")
        ├── device_id : string
        └── timestamp : timestamp
```

---

## Security Rules (starter)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Authenticated users can read/write their own data
    match /global_memory/{key} {
      allow read, write: if request.auth != null;
    }
    match /project_memory/{projectId}/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    match /devices/{deviceId} {
      allow read, write: if request.auth != null;
    }
  }
}
```
