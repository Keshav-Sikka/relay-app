import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';

export type ItemType = 'note' | 'link' | 'code' | 'image';

export interface RelayItem {
  id: string;
  title: string;
  content: string;
  type: ItemType;
  tags: string[];
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  synced: boolean;
}

export interface RelayItemRow {
  id: string;
  title: string;
  content: string;
  type: string;
  tags: string;
  isArchived: number;
  createdAt: number;
  updatedAt: number;
  synced: number;
}

export interface ItemFilter {
  type?: string;
  query?: string;
  archived?: boolean;
}

export interface CreateItemInput {
  id?: string;
  title: string;
  content: string;
  type: ItemType;
  tags?: string[] | string;
  isArchived?: boolean | number;
  createdAt?: number;
  updatedAt?: number;
  synced?: boolean | number;
}

export interface UpdateItemInput {
  title?: string;
  content?: string;
  type?: ItemType;
  tags?: string[] | string;
  isArchived?: boolean | number;
  updatedAt?: number;
  synced?: boolean | number;
}

const DB_NAME = 'relay.db';

let databaseInstance: SQLiteDatabase | null = null;
type DatabaseChangeListener = () => void;
const listeners = new Set<DatabaseChangeListener>();

function notifyDatabaseChange(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn('[Relay DB] Listener threw an error:', err);
    }
  }
}

export function subscribeToDatabaseChanges(listener: DatabaseChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'relay_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

function parseTags(rawTags: string): string[] {
  if (!rawTags) return [];
  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t).trim()).filter(Boolean);
    }
  } catch {
    // Fallback if legacy comma-separated string
    return rawTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function serializeTags(tags?: string[] | string): string {
  if (!tags) return '[]';
  if (Array.isArray(tags)) {
    return JSON.stringify(tags.map((t) => String(t).trim()).filter(Boolean));
  }
  if (typeof tags === 'string') {
    return JSON.stringify(
      tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    );
  }
  return '[]';
}

function rowToItem(row: RelayItemRow): RelayItem {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: (row.type as ItemType) || 'note',
    tags: parseTags(row.tags),
    isArchived: row.isArchived === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    synced: row.synced === 1,
  };
}

/**
 * Initializes and returns the SQLite database instance using modern `openDatabaseSync`.
 */
export function getDatabase(): SQLiteDatabase {
  if (databaseInstance) {
    return databaseInstance;
  }

  const db = openDatabaseSync(DB_NAME);

  // WAL mode for concurrent write stability
  try {
    db.execSync('PRAGMA journal_mode = WAL;');
  } catch (e) {
    // Fallback for environments where WAL pragma is unsupported
    console.debug('[Relay DB] Note: journal_mode WAL setting skipped or ignored:', e);
  }

  // Core items table schema
  db.execSync(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_items_isArchived ON items(isArchived);
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_createdAt ON items(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_items_updatedAt ON items(updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_items_synced ON items(synced);
  `);

  databaseInstance = db;
  seedInitialDataIfNeeded();
  return db;
}

/**
 * Query items from the SQLite database with optional filters.
 * - type: 'note' | 'link' | 'code' or 'all'
 * - query: search string across title, content, or tags
 * - archived: boolean flag to filter by archive state (if undefined, returns both)
 */
export function getItems(filter?: { type?: string; query?: string; archived?: boolean }): RelayItem[] {
  const db = getDatabase();
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter?.archived !== undefined) {
    whereClauses.push('isArchived = ?');
    params.push(filter.archived ? 1 : 0);
  }

  if (filter?.type && filter.type.toLowerCase() !== 'all') {
    whereClauses.push('type = ?');
    params.push(filter.type.toLowerCase());
  }

  if (filter?.query && filter.query.trim().length > 0) {
    const q = `%${filter.query.trim().toLowerCase()}%`;
    whereClauses.push('(LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?)');
    params.push(q, q, q);
  }

  let sql = 'SELECT * FROM items';
  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }
  sql += ' ORDER BY updatedAt DESC, createdAt DESC';

  const rows = db.getAllSync<RelayItemRow>(sql, params);
  return rows.map(rowToItem);
}

/**
 * Fetch a single item by its ID.
 */
export function getItemById(id: string): RelayItem | null {
  const db = getDatabase();
  const row = db.getFirstSync<RelayItemRow>('SELECT * FROM items WHERE id = ? LIMIT 1', [id]);
  return row ? rowToItem(row) : null;
}

/**
 * Insert a new item into the SQLite database.
 */
export function insertItem(item: CreateItemInput): RelayItem {
  const db = getDatabase();
  const id = item.id || generateId();
  const now = Date.now();
  const createdAt = item.createdAt ?? now;
  const updatedAt = item.updatedAt ?? now;
  const isArchived = item.isArchived ? 1 : 0;
  const synced = item.synced !== undefined ? (item.synced ? 1 : 0) : 0;
  const tagsJson = serializeTags(item.tags);

  const title = (item.title || '').trim();
  const content = (item.content || '').trim();
  const type = item.type;

  const sql = `
    INSERT INTO items (id, title, content, type, tags, isArchived, createdAt, updatedAt, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.runSync(sql, [id, title, content, type, tagsJson, isArchived, createdAt, updatedAt, synced]);

  notifyDatabaseChange();

  return {
    id,
    title,
    content,
    type,
    tags: parseTags(tagsJson),
    isArchived: isArchived === 1,
    createdAt,
    updatedAt,
    synced: synced === 1,
  };
}

/**
 * Update an existing item by its ID.
 */
export function updateItem(id: string, item: UpdateItemInput): RelayItem | null {
  const db = getDatabase();
  const existing = getItemById(id);
  if (!existing) {
    return null;
  }

  const setClauses: string[] = [];
  const params: (string | number)[] = [];

  if (item.title !== undefined) {
    setClauses.push('title = ?');
    params.push(item.title.trim());
  }

  if (item.content !== undefined) {
    setClauses.push('content = ?');
    params.push(item.content.trim());
  }

  if (item.type !== undefined) {
    setClauses.push('type = ?');
    params.push(item.type);
  }

  if (item.tags !== undefined) {
    setClauses.push('tags = ?');
    params.push(serializeTags(item.tags));
  }

  if (item.isArchived !== undefined) {
    setClauses.push('isArchived = ?');
    params.push(item.isArchived ? 1 : 0);
  }

  const updatedAt = item.updatedAt ?? Date.now();
  setClauses.push('updatedAt = ?');
  params.push(updatedAt);

  // If synced is explicitly supplied, use it; otherwise mark as 0 (pending sync)
  const synced = item.synced !== undefined ? (item.synced ? 1 : 0) : 0;
  setClauses.push('synced = ?');
  params.push(synced);

  params.push(id);

  const sql = `UPDATE items SET ${setClauses.join(', ')} WHERE id = ?`;
  db.runSync(sql, params);

  notifyDatabaseChange();
  return getItemById(id);
}

/**
 * Delete an item from the SQLite database.
 */
export function deleteItem(id: string): boolean {
  const db = getDatabase();
  const result = db.runSync('DELETE FROM items WHERE id = ?', [id]);
  notifyDatabaseChange();
  return result.changes > 0;
}

/**
 * Toggle the archive state of an item.
 */
export function toggleArchive(id: string): RelayItem | null {
  const existing = getItemById(id);
  if (!existing) {
    return null;
  }
  return updateItem(id, {
    isArchived: !existing.isArchived,
    updatedAt: Date.now(),
    synced: 0,
  });
}

/**
 * Fetch all items that have not yet been synced to remote.
 */
export function getUnsyncedItems(): RelayItem[] {
  const db = getDatabase();
  const rows = db.getAllSync<RelayItemRow>('SELECT * FROM items WHERE synced = 0 ORDER BY updatedAt ASC');
  return rows.map(rowToItem);
}

/**
 * Mark a list of item IDs as synced.
 */
export function markItemsAsSynced(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`UPDATE items SET synced = 1 WHERE id IN (${placeholders})`, ids);
  notifyDatabaseChange();
}

/**
 * Clears cloud-synced items (synced = 1) on sign out while preserving unsynced offline drafts.
 */
export function resetLocalStore(): void {
  try {
    const db = getDatabase();
    // Preserve unsynced drafts (synced = 0)
    db.runSync('DELETE FROM items WHERE synced = 1');
    // Re-seed default items if store is empty
    seedInitialDataIfNeeded();
  } catch (err) {
    console.error('[Relay DB] Error clearing synced items on sign out:', err);
  }
  notifyDatabaseChange();
}

export const clearSyncedItemsOnSignOut = resetLocalStore;

/**
 * Completely wipe all records from local SQLite (both synced and drafts)
 * and restore default initial sample items.
 * Used for intentional account deletion & data purging.
 */
export function purgeAllData(): void {
  try {
    const db = getDatabase();
    db.runSync('DELETE FROM items');
    seedInitialDataIfNeeded();
  } catch (err) {
    console.error('[Relay DB] Error purging all data:', err);
  }
  notifyDatabaseChange();
}

/**
 * Upsert items fetched from remote backend into local SQLite.
 * Protects pending local changes if local timestamp is newer.
 */
export function upsertRemoteItems(remoteItems: RelayItem[]): { inserted: number; updated: number } {
  if (remoteItems.length === 0) return { inserted: 0, updated: 0 };
  const db = getDatabase();
  let inserted = 0;
  let updated = 0;

  for (const remote of remoteItems) {
    const local = getItemById(remote.id);
    const tagsJson = serializeTags(remote.tags);

    if (!local) {
      db.runSync(
        `INSERT INTO items (id, title, content, type, tags, isArchived, createdAt, updatedAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          remote.id,
          remote.title,
          remote.content,
          remote.type,
          tagsJson,
          remote.isArchived ? 1 : 0,
          remote.createdAt,
          remote.updatedAt,
        ]
      );
      inserted++;
    } else {
      // If local item has pending changes and is newer than remote, preserve local
      if (!local.synced && local.updatedAt > remote.updatedAt) {
        continue;
      }

      db.runSync(
        `UPDATE items
         SET title = ?, content = ?, type = ?, tags = ?, isArchived = ?, createdAt = ?, updatedAt = ?, synced = 1
         WHERE id = ?`,
        [
          remote.title,
          remote.content,
          remote.type,
          tagsJson,
          remote.isArchived ? 1 : 0,
          remote.createdAt,
          remote.updatedAt,
          remote.id,
        ]
      );
      updated++;
    }
  }

  if (inserted > 0 || updated > 0) {
    notifyDatabaseChange();
  }

  return { inserted, updated };
}

/**
 * Populate realistic starter data if the database is completely empty.
 */
export function seedInitialDataIfNeeded(): void {
  const db = getDatabase();
  const countRow = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM items');
  if (countRow && countRow.count > 0) {
    return;
  }

  const now = Date.now();

  insertItem({
    title: 'Offline-First Relay Architecture',
    content:
      'Relay uses local SQLite via expo-sqlite (openDatabaseSync) for sub-millisecond local reads and zero network dependency. Items update instantaneously on-device.',
    type: 'note',
    tags: ['offline-first', 'sqlite', 'architecture'],
    isArchived: false,
    createdAt: now - 3600000 * 2,
    updatedAt: now - 3600000 * 2,
    synced: 1,
  });

  insertItem({
    title: 'Expo SDK 57 Reference Docs',
    content: 'https://docs.expo.dev/versions/latest/',
    type: 'link',
    tags: ['expo', 'react-native', 'docs'],
    isArchived: false,
    createdAt: now - 3600000,
    updatedAt: now - 3600000,
    synced: 1,
  });

  insertItem({
    title: 'Modern SQLite Tag Querying',
    content:
      'const items = db.getAllSync(\n  "SELECT * FROM items WHERE isArchived = ? ORDER BY updatedAt DESC",\n  [0]\n);',
    type: 'code',
    tags: ['typescript', 'sql', 'snippet'],
    isArchived: false,
    createdAt: now - 1800000,
    updatedAt: now - 1800000,
    synced: 1,
  });

  insertItem({
    title: 'Archive Sample: Legacy Note',
    content: 'This note was archived previously to demonstrate how the Archive tab works.',
    type: 'note',
    tags: ['archive', 'sample'],
    isArchived: true,
    createdAt: now - 86400000,
    updatedAt: now - 86400000,
    synced: 1,
  });
}

/**
 * React hook to reactively subscribe to Relay items based on filter criteria.
 */
export function useRelayItems(filter?: ItemFilter) {
  const filterKey = JSON.stringify(filter ?? {});

  const [items, setItems] = useState<RelayItem[]>(() => {
    try {
      seedInitialDataIfNeeded();
      return getItems(filter);
    } catch {
      return [];
    }
  });

  const refresh = useCallback(() => {
    try {
      setItems(getItems(filter));
    } catch (err) {
      console.error('[Relay DB] Error loading items:', err);
    }
  }, [filterKey]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToDatabaseChanges(refresh);
    return unsubscribe;
  }, [refresh]);

  return { items, refresh };
}
