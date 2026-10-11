import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import {
  getUnsyncedItems,
  markItemsAsSynced,
  resetLocalStore,
  subscribeToDatabaseChanges,
  upsertRemoteItems,
  type ItemType,
  type RelayItem,
} from '../db/database';
import { isSupabaseConfigured, supabase } from '../supabase/client';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastSyncedAt: number | null;
  errorMessage?: string;
  userEmail?: string | null;
}

export interface PushResult {
  pushedCount: number;
  success: boolean;
  errors?: string[];
}

export interface PullResult {
  pulledCount: number;
  success: boolean;
  errors?: string[];
}

export interface SyncEngine {
  pushChanges(): Promise<PushResult>;
  pullChanges(): Promise<PullResult>;
  getSyncStatus(): SyncStatus;
  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void;
  syncAll(): Promise<{ push: PushResult; pull: PullResult }>;
  resetSession(): void;
}

/**
 * Ensures timestamp is consistently serialized as an ISO 8601 string
 * for clean mapping to Supabase text / timestamp columns.
 */
function toISOString(timestamp?: number | string | null): string {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp === 'number') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Maps a local RelayItem to the exact columns of the Supabase `items` table:
 * (`id`, `user_id`, `title`, `content`, `type`, `tags`, `is_archived`, `created_at`, `updated_at`)
 */
export function toSupabaseRow(item: RelayItem, userId: string) {
  return {
    id: String(item.id),
    user_id: String(userId),
    title: String(item.title ?? ''),
    content: String(item.content ?? ''),
    type: item.type,
    tags: Array.isArray(item.tags) ? item.tags : [],
    is_archived: item.isArchived === true,
    created_at: toISOString(item.createdAt),
    updated_at: toISOString(item.updatedAt),
  };
}

function fromSupabaseRow(row: any): RelayItem {
  let tags: string[] = [];
  if (Array.isArray(row.tags)) {
    tags = row.tags;
  } else if (typeof row.tags === 'string') {
    try {
      const parsed = JSON.parse(row.tags);
      tags = Array.isArray(parsed) ? parsed : [row.tags];
    } catch {
      tags = row.tags
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);
    }
  }

  const isArchived = Boolean(row.is_archived ?? row.isArchived);

  let createdAt = Date.now();
  if (row.created_at) {
    createdAt = typeof row.created_at === 'number' ? row.created_at : new Date(row.created_at).getTime();
  } else if (row.createdAt) {
    createdAt = typeof row.createdAt === 'number' ? row.createdAt : new Date(row.createdAt).getTime();
  }

  let updatedAt = Date.now();
  if (row.updated_at) {
    updatedAt = typeof row.updated_at === 'number' ? row.updated_at : new Date(row.updated_at).getTime();
  } else if (row.updatedAt) {
    updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : new Date(row.updatedAt).getTime();
  }

  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    type: (row.type as ItemType) || 'note',
    tags,
    isArchived,
    createdAt: isNaN(createdAt) ? Date.now() : createdAt,
    updatedAt: isNaN(updatedAt) ? Date.now() : updatedAt,
    synced: true,
  };
}

class RelaySyncEngine implements SyncEngine {
  private state: SyncState = 'idle';
  private lastSyncedAt: number | null = null;
  private errorMessage?: string;
  private isOnline: boolean = true;
  private userEmail: string | null = null;
  private listeners = new Set<(status: SyncStatus) => void>();
  private autoSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.initNetworkListener();
    this.initAuthListener();

    // Update pending state on local database mutation
    subscribeToDatabaseChanges(() => {
      this.notifyListeners();
      this.triggerDebouncedSync();
    });
  }

  private triggerDebouncedSync(): void {
    if (!this.isOnline || !isSupabaseConfigured()) return;
    if (this.autoSyncDebounceTimer) {
      clearTimeout(this.autoSyncDebounceTimer);
    }
    this.autoSyncDebounceTimer = setTimeout(() => {
      this.pushChanges().catch((err) => {
        console.warn('[Relay SyncEngine] Background debounced push failed:', err);
      });
    }, 1500);
  }

  private initNetworkListener(): void {
    NetInfo.fetch().then((state: NetInfoState) => {
      this.handleNetworkChange(state);
    });

    NetInfo.addEventListener((state: NetInfoState) => {
      this.handleNetworkChange(state);
    });
  }

  private handleNetworkChange(state: NetInfoState): void {
    const wasOnline = this.isOnline;
    this.isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);

    if (!this.isOnline) {
      this.state = 'offline';
      this.notifyListeners();
      console.log('[Relay SyncEngine] 📡 Offline mode engaged.');
    } else if (!wasOnline && this.isOnline) {
      this.state = 'idle';
      this.notifyListeners();
      console.log('[Relay SyncEngine] 🌐 Connection restored. Attempting auto-sync...');
      this.syncAll().catch((err) => {
        console.warn('[Relay SyncEngine] Auto-sync after reconnect failed:', err);
      });
    }
  }

  private initAuthListener(): void {
    if (!isSupabaseConfigured()) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      this.userEmail = session?.user?.email ?? null;
      this.notifyListeners();
      if (session?.user) {
        this.syncAll().catch((err) => {
          console.warn('[Relay SyncEngine] Initial sync after session load failed:', err);
        });
      }
    });

    supabase.auth.onAuthStateChange((event, session) => {
      const prevEmail = this.userEmail;
      this.userEmail = session?.user?.email ?? null;

      if (event === 'SIGNED_IN' || (session?.user && prevEmail !== session.user.email)) {
        this.syncAll().catch((err) => {
          console.warn('[Relay SyncEngine] Auto-sync on sign-in failed:', err);
        });
      } else if (event === 'SIGNED_OUT') {
        this.resetSession();
      }
    });
  }

  private notifyListeners(): void {
    const status = this.getSyncStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.warn('[Relay SyncEngine] Listener error:', err);
      }
    }
  }

  public getSyncStatus(): SyncStatus {
    let pendingCount = 0;
    try {
      pendingCount = getUnsyncedItems().length;
    } catch {
      pendingCount = 0;
    }

    let state = this.state;
    if (!this.isOnline) {
      state = 'offline';
    }

    return {
      state,
      pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      errorMessage: this.errorMessage,
      userEmail: this.userEmail,
    };
  }

  public subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSyncStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Reset active in-memory state and clear the local store on sign out
   * so one user's items do not persist on screen for subsequent sessions.
   */
  public resetSession(): void {
    this.userEmail = null;
    this.state = 'idle';
    this.lastSyncedAt = null;
    this.errorMessage = undefined;
    resetLocalStore();
    this.notifyListeners();
  }

  /**
   * Push uncommitted local SQLite items (synced = 0) to Supabase items table.
   */
  public async pushChanges(): Promise<PushResult> {
    if (!this.isOnline) {
      this.state = 'offline';
      this.notifyListeners();
      return { pushedCount: 0, success: false, errors: ['Device is offline'] };
    }

    const pending = getUnsyncedItems();
    if (pending.length === 0) {
      this.state = 'synced';
      this.notifyListeners();
      return { pushedCount: 0, success: true };
    }

    if (!isSupabaseConfigured()) {
      console.log(
        `[Relay SyncEngine] Offline Mode: Supabase not configured. ${pending.length} changes remain safely in local SQLite.`
      );
      this.state = 'idle';
      this.notifyListeners();
      return { pushedCount: 0, success: true };
    }

    let user: any = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch (e) {
      console.warn('[Relay SyncEngine] Could not get user:', e);
    }

    if (!user) {
      console.log(
        `[Relay SyncEngine] User not signed in. ${pending.length} pending changes stored in offline SQLite.`
      );
      this.state = 'idle';
      this.notifyListeners();
      return { pushedCount: 0, success: true };
    }

    this.state = 'syncing';
    this.errorMessage = undefined;
    this.notifyListeners();

    console.log(`[Relay SyncEngine] 🚀 Pushing ${pending.length} item(s) to Supabase...`);

    try {
      const rows = pending.map((item) => toSupabaseRow(item, user.id));

      const { error: upsertError } = await supabase.from('items').upsert(rows);

      if (upsertError) {
        // Fallback for legacy camelCase column schemas
        if (
          upsertError.message?.includes('is_archived') ||
          upsertError.message?.includes('column') ||
          upsertError.message?.includes('created_at')
        ) {
          const fallbackRows = pending.map((item) => ({
            id: String(item.id),
            user_id: String(user.id),
            title: String(item.title ?? ''),
            content: String(item.content ?? ''),
            type: item.type,
            tags: Array.isArray(item.tags) ? item.tags : [],
            isArchived: item.isArchived === true,
            createdAt: toISOString(item.createdAt),
            updatedAt: toISOString(item.updatedAt),
          }));

          const { error: fallbackError } = await supabase.from('items').upsert(fallbackRows);
          if (fallbackError) {
            throw fallbackError;
          }
        } else {
          throw upsertError;
        }
      }

      markItemsAsSynced(pending.map((p) => p.id));
      this.lastSyncedAt = Date.now();
      this.state = 'synced';
      this.notifyListeners();

      console.log(`[Relay SyncEngine] ✅ Successfully pushed ${pending.length} item(s) to Supabase.`);
      return { pushedCount: pending.length, success: true };
    } catch (err: any) {
      this.state = 'error';
      this.errorMessage = err?.message || 'Push sync failed';
      this.notifyListeners();
      console.error('[Relay SyncEngine] ❌ Push failed:', err);
      return { pushedCount: 0, success: false, errors: [this.errorMessage ?? 'Push sync failed'] };
    }
  }

  /**
   * Pull all remote items belonging to the user from Supabase and upsert them into local SQLite.
   */
  public async pullChanges(): Promise<PullResult> {
    if (!this.isOnline) {
      this.state = 'offline';
      this.notifyListeners();
      return { pulledCount: 0, success: false, errors: ['Device is offline'] };
    }

    if (!isSupabaseConfigured()) {
      this.state = 'idle';
      this.notifyListeners();
      return { pulledCount: 0, success: true };
    }

    let user: any = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch (e) {
      console.warn('[Relay SyncEngine] Could not get user for pull:', e);
    }

    if (!user) {
      this.state = 'idle';
      this.notifyListeners();
      return { pulledCount: 0, success: true };
    }

    this.state = 'syncing';
    this.errorMessage = undefined;
    this.notifyListeners();

    console.log('[Relay SyncEngine] ⬇️ Fetching user items from Supabase...');

    try {
      const { data: remoteRows, error: pullError } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', user.id);

      if (pullError) {
        throw pullError;
      }

      let pulledCount = 0;
      if (remoteRows && remoteRows.length > 0) {
        const remoteItems: RelayItem[] = remoteRows.map(fromSupabaseRow);
        const { inserted, updated } = upsertRemoteItems(remoteItems);
        pulledCount = remoteRows.length;
        console.log(
          `[Relay SyncEngine] ✅ Pulled ${pulledCount} items from Supabase (${inserted} inserted, ${updated} updated locally).`
        );
      } else {
        console.log('[Relay SyncEngine] ✅ Pull complete: No remote items found for this user.');
      }

      this.lastSyncedAt = Date.now();
      this.state = 'synced';
      this.notifyListeners();

      return { pulledCount, success: true };
    } catch (err: any) {
      this.state = 'error';
      this.errorMessage = err?.message || 'Pull sync failed';
      this.notifyListeners();
      console.error('[Relay SyncEngine] ❌ Push failed:', err);
      return { pulledCount: 0, success: false, errors: [this.errorMessage ?? 'Pull sync failed'] };
    }
  }

  /**
   * Complete bidirectional synchronization cycle.
   */
  public async syncAll(): Promise<{ push: PushResult; pull: PullResult }> {
    const push = await this.pushChanges();
    const pull = await this.pullChanges();
    return { push, pull };
  }
}

export const syncEngine: SyncEngine = new RelaySyncEngine();

/**
 * React hook to observe sync status and trigger manual syncs.
 */
export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(() => syncEngine.getSyncStatus());

  useEffect(() => {
    return syncEngine.subscribeSyncStatus(setStatus);
  }, []);

  return {
    ...status,
    pushChanges: () => syncEngine.pushChanges(),
    pullChanges: () => syncEngine.pullChanges(),
    syncAll: () => syncEngine.syncAll(),
    resetSession: () => syncEngine.resetSession(),
  };
}
