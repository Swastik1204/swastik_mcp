# Firestore Schema Design — Swastik MCP (v2 — Tombstone-Aware)

## Collections

### `global_memory`
Top-level collection. Each document = one memory key.

```
global_memory/
  └── {key}                              ← doc ID = memory key
        ├── value          : any         ← the stored value
        ├── revision       : number      ← monotonically increasing
        ├── updated_at     : timestamp
        ├── updated_by     : string      ← Firebase Auth UID
        ├── source_device_id : string    ← which device wrote this
        ├── deleted        : boolean     ← tombstone flag
        ├── deleted_at     : timestamp?  ← when tombstoned
        ├── deleted_by     : string?     ← who tombstoned
        ├── delete_reason  : string?     ← why (e.g. "infection cleanup")
        └── infection_id   : string?     ← batch-delete correlation ID
```

---

### `project_memory`
Top-level collection. Each doc = a project. Sub-collection `entries` holds key-value pairs.

```
project_memory/
  └── {project_id}
        └── entries/
              └── {key}
                    ├── value, revision, updated_at, updated_by,
                    │   source_device_id, deleted, deleted_at,
                    │   deleted_by, delete_reason, infection_id
                    └── (same fields as global_memory)
```

---

### `users`
```
users/
  └── {uid}
        ├── email       : string
        ├── displayName : string
        ├── role        : string   ("owner" | "viewer")
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
        ├── last_sync   : timestamp   ← cursor for incremental sync
        ├── status      : string ("online" | "offline")
        └── platform    : string ("windows" | "macos" | "linux")
```

---

### `logs`
```
logs/
  └── {auto_id}
        ├── action     : string  ("DELETE" | "RESTORE" | "SET")
        ├── collection : string  ("global_memory" | "project_memory")
        ├── doc_path   : string  (key or "projectId/key")
        ├── actor_uid  : string  (Firebase Auth UID)
        ├── details    : map     (reason, infection_id, etc.)
        └── timestamp  : timestamp
```

---

## Sync Invariants

1. **Revision wins** — higher `revision` always overwrites lower.
2. **Tombstones propagate** — a `deleted: true` entry must never be resurrected by a stale pull.
3. **Incremental pull** — each device tracks its own `last_sync` cursor; only docs with `updated_at > last_sync` are fetched.
4. **Dead-letter queue** — sync items that fail ≥ 5 times are parked; retried manually via `POST /api/sync/retry-dead-letters`.

---

## Security Rules (production)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /global_memory/{key} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
      allow delete: if request.auth.token.admin == true;
    }
    match /project_memory/{projectId}/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    match /devices/{deviceId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /logs/{logId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      // Logs are append-only
      allow update, delete: if false;
    }
  }
}
```
