import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getItems, purgeAllData, type RelayItem } from '../db/database';
import { isSupabaseConfigured, supabase } from '../supabase/client';
import { syncEngine } from '../sync/syncEngine';

export interface ExportResult {
  success: boolean;
  itemCount: number;
  uri?: string;
  error?: string;
}

export interface PurgeResult {
  success: boolean;
  error?: string;
}

/**
 * Collects all local SQLite items, formats them into a clean JSON file
 * using expo-file-system, and triggers the system share dialog via expo-sharing.
 */
export async function exportAllData(): Promise<ExportResult> {
  try {
    const items = getItems(); // returns all items (both inbox & archived)
    const exportPayload = {
      app: 'Relay',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      itemCount: items.length,
      items: items.map((item: RelayItem) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        type: item.type,
        tags: item.tags,
        isArchived: item.isArchived,
        createdAt: item.createdAt,
        createdAtISO: new Date(item.createdAt).toISOString(),
        updatedAt: item.updatedAt,
        updatedAtISO: new Date(item.updatedAt).toISOString(),
      })),
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);
    const fileName = `relay-backup-${new Date().toISOString().slice(0, 10)}.json`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true, itemCount: items.length };
      }
    }

    // Native file generation via modern expo-file-system
    const exportFile = new File(Paths.cache, fileName);
    if (exportFile.exists) {
      try {
        exportFile.delete();
      } catch {
        // ignore if already deleted
      }
    }

    exportFile.create();
    exportFile.write(jsonString);

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(exportFile.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Export Relay Data',
        UTI: 'public.json',
      });
      return { success: true, itemCount: items.length, uri: exportFile.uri };
    }

    return { success: true, itemCount: items.length, uri: exportFile.uri };
  } catch (err: any) {
    console.error('[Relay] Export data failed:', err);
    return {
      success: false,
      itemCount: 0,
      error: err?.message || 'Failed to export data',
    };
  }
}

/**
 * Permanently deletes all user records from Supabase (`delete from items where user_id = auth.uid()`),
 * drops local items in SQLite, resets sync session, and resets to default initial state.
 */
export async function deleteAccountAndPurgeData(userId?: string): Promise<PurgeResult> {
  try {
    // 1. Delete all user records from Supabase if authenticated
    if (userId && isSupabaseConfigured()) {
      const { error: remoteDeleteError } = await supabase
        .from('items')
        .delete()
        .eq('user_id', userId);

      if (remoteDeleteError) {
        console.warn('[Relay Purge] Remote items delete returned error:', remoteDeleteError);
      }
    }

    // 2. Wipe local SQLite data and restore default starter state
    purgeAllData();

    // 3. Reset sync engine state
    syncEngine.resetSession();

    return { success: true };
  } catch (err: any) {
    console.error('[Relay] Delete account & purge failed:', err);
    return {
      success: false,
      error: err?.message || 'Failed to delete account and purge data',
    };
  }
}
