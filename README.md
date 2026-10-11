# Relay — Personal Save-For-Later Capture Inbox

Relay is an offline-first cross-device inbox designed for rapid capture and retrieval of notes, code snippets, web bookmarks, and media attachments. Built with Expo (SDK 57), SQLite, and Supabase.

---

## Architecture Overview
```markdown
+-------------------------------------------------------------------------+
|                           RELAY CLIENT (EXPO)                           |
|                                                                         |
|   +-------------------+    +--------------------+    +--------------+   |
|   |   UI Presentation |    |  Clipboard Intent  |    | Data Export  |   |
|   |  (Feed/Edit/Tags) |    |  (Fast Capture)    |    |  (JSON)      |   |
|   +---------+---------+    +---------+----------+    +-------+------+   |
|             \                        |                      /           |
|              +-----------------------+---------------------+            |
|                                      v                                  |
|                         [Local SQLite Database]                         |
|                         PRAGMA journal_mode=WAL                         |
+--------------------------------------|----------------------------------+
|
(SyncEngine - Background)
NetInfo Listener / Optimistic UI
|
v  HTTPS / WSS
+-------------------------------------------------------------------------+
|                             SUPABASE CLOUD                              |
|                                                                         |
|   +--------------------------+        +-----------------------------+   |
|   |      Supabase Auth       |  --->  |     PostgreSQL Datastore    |   |
|   | (Email/Password Session) |        | (Row Level Security Enabled)|   |
|   +--------------------------+        +-----------------------------+   |
+-------------------------------------------------------------------------+
```

---

## Stages Implemented

### Stage 1: Reliable Local Inbox
- **Persistence:** Local disk storage via `expo-sqlite` using Write-Ahead Logging (`WAL`) for sub-millisecond querying without thread blocking.
- **Data Models:** Structured entries supporting four primary schemas: Notes, Bookmarks/Links, Code Snippets (with syntax monospace views), and Images.
- **Search & Filter:** Instant client-side SQL filtering matching tags, titles, and text contents with debounced input handling.
- **Soft Deletion:** Integrated archive and restore workflows.

### Stage 2: Cross-Device Synchronization & Cloud Security
- **Authentication:** Email & Password authentication managed via Supabase Auth with persistent native tokens via `expo-secure-store`.
- **Backend Privacy & Row Level Security (RLS):** Data isolation enforced at the PostgreSQL layer via database policies (`auth.uid() = user_id`). Direct queries or deep-link manipulation cannot access other users' data.
- **Offline-First Synchronization:** Optimistic local writes (`synced = 0`). A decoupled background `SyncEngine` listens to network state via `@react-native-community/netinfo`, automatically pushing unsynced batches and reconciling updates upon reconnection.

### Stage 3: Product Extensions & Data Ownership
- **Fast Capture:** Automatic clipboard inspection on application focus with schema detection (URLs vs. Code blocks vs. Text) and non-blocking capture sheet integration.
- **Mission E (Data Ownership):** 
  - Complete JSON export utility via native file sharing sheets (`expo-sharing` / `expo-file-system`).
  - Account and data deletion pipeline that purges remote PostgreSQL records, resets local SQLite storage, and flushes session tokens.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- Expo Go on physical device (iOS / Android)

### Setup
1. Clone the repository:
   ```bash
   git clone [https://github.com/Keshav-Sikka/relay-app.git](https://github.com/Keshav-Sikka/relay-app.git)
   cd relay-app
Install dependencies:

Bash
npm install
Configure environment variables:
Copy .env.example to .env and fill in your Supabase credentials:

Code snippet
EXPO_PUBLIC_SUPABASE_URL=[https://vyqxnhawazgtssorszvz.supabase.co](https://vyqxnhawazgtssorszvz.supabase.co)
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
Start the application:

Bash
npx expo start -c
