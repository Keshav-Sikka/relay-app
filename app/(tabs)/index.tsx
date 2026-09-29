import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { SearchBar } from '@/components/SearchBar';
import { TypeFilterChips, type FilterType } from '@/components/TypeFilterChips';
import { ItemCard } from '@/components/ItemCard';
import { AddItemModal } from '@/components/AddItemModal';
import { AuthModal } from '@/components/AuthModal';
import { ClipboardCaptureBanner, type CapturedClipboardItem } from '@/components/ClipboardCaptureBanner';
import { toggleArchive, useRelayItems, type CreateItemInput, type RelayItem } from '@/lib/db/database';
import { useSyncStatus } from '@/lib/sync/syncEngine';
import { useAuth } from '@/lib/auth/AuthContext';

interface InboxHeaderProps {
  theme: (typeof Colors)[keyof typeof Colors];
  syncStatus: ReturnType<typeof useSyncStatus>;
  userEmail: string | null | undefined;
  onOpenAuth: () => void;
  searchQuery: string;
  onSearchChange: (text: string) => void;
  selectedType: FilterType;
  onSelectType: (type: FilterType) => void;
  typeCounts: Record<FilterType, number>;
}

const InboxHeader = React.memo(function InboxHeader({
  theme,
  syncStatus,
  userEmail,
  onOpenAuth,
  searchQuery,
  onSearchChange,
  selectedType,
  onSelectType,
  typeCounts,
}: InboxHeaderProps) {
  return (
    <View style={styles.headerContainer}>
      {/* Top Header Row: Title, Sync Status, Account Avatar */}
      <View style={styles.topBar}>
        <Text style={[styles.appName, { color: theme.text }]}>Relay</Text>

        <View style={styles.topRightControls}>
          {/* Single Live Sync Status Pill */}
          <Pressable
            onPress={() => syncStatus.syncAll()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Sync status: ${syncStatus.state}. Tap to sync.`}
            style={({ pressed }) => [
              styles.syncPill,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            {syncStatus.state === 'syncing' ? (
              <ActivityIndicator size="small" color={theme.tint} style={{ marginRight: 5 }} />
            ) : (
              <Ionicons
                name={
                  syncStatus.state === 'offline'
                    ? 'cloud-offline-outline'
                    : syncStatus.pendingCount > 0
                    ? 'cloud-upload-outline'
                    : 'checkmark-circle'
                }
                size={14}
                color={
                  syncStatus.state === 'offline'
                    ? theme.danger
                    : syncStatus.pendingCount > 0
                    ? theme.warning
                    : theme.success
                }
                style={{ marginRight: 4 }}
              />
            )}
            <Text style={[styles.syncPillText, { color: theme.secondaryText }]}>
              {syncStatus.state === 'syncing'
                ? 'Syncing'
                : syncStatus.state === 'offline'
                ? 'Offline'
                : syncStatus.pendingCount > 0
                ? `${syncStatus.pendingCount} Pending`
                : 'Synced'}
            </Text>
          </Pressable>

          {/* Single Account / Settings Button */}
          <Pressable
            onPress={onOpenAuth}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={userEmail ? `Signed in as ${userEmail}. Open settings` : 'Sign in to account'}
            style={({ pressed }) => [
              styles.avatarBtn,
              {
                backgroundColor: userEmail ? `${theme.tint}18` : theme.inputBg,
                borderColor: userEmail ? `${theme.tint}40` : theme.inputBorder,
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            {userEmail ? (
              <Text style={[styles.avatarText, { color: theme.tint }]}>
                {userEmail.charAt(0).toUpperCase()}
              </Text>
            ) : (
              <Ionicons name="person-outline" size={17} color={theme.secondaryText} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Search Input */}
      <SearchBar value={searchQuery} onChangeText={onSearchChange} />

      {/* Category Filter Chips */}
      <TypeFilterChips
        selectedType={selectedType}
        onSelectType={onSelectType}
        counts={typeCounts}
      />
    </View>
  );
});

export default function InboxScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const { user } = useAuth();

  const [selectedType, setSelectedType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<RelayItem | null>(null);
  const [fastCaptureInitialValues, setFastCaptureInitialValues] = useState<Partial<CreateItemInput> | null>(null);
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync engine status
  const syncStatus = useSyncStatus();

  // Load non-archived items reactively from SQLite
  const { items } = useRelayItems({
    archived: false,
    type: selectedType === 'all' ? undefined : selectedType,
    query: searchQuery,
  });

  // Also query all non-archived items to show badge counts per chip
  const { items: allInboxItems } = useRelayItems({ archived: false });

  const typeCounts = useMemo(() => {
    const counts: Record<FilterType, number> = {
      all: allInboxItems.length,
      note: 0,
      link: 0,
      code: 0,
      image: 0,
    };
    for (const item of allInboxItems) {
      if (item.type in counts) {
        counts[item.type as FilterType]++;
      }
    }
    return counts;
  }, [allInboxItems]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  const handleSelectType = useCallback((type: FilterType) => {
    setSelectedType(type);
  }, []);

  const handleToggleArchive = useCallback((id: string) => {
    toggleArchive(id);
  }, []);

  const handleCardPress = useCallback((item: RelayItem) => {
    setEditingItem(item);
    setFastCaptureInitialValues(null);
    setIsAddModalVisible(true);
  }, []);

  const handleOpenAddModal = useCallback(() => {
    setEditingItem(null);
    setFastCaptureInitialValues(null);
    setIsAddModalVisible(true);
  }, []);

  const handleCloseAddModal = useCallback(() => {
    setIsAddModalVisible(false);
    setEditingItem(null);
    setFastCaptureInitialValues(null);
  }, []);

  const handleItemAdded = useCallback(() => {
    if (fastCaptureInitialValues?.content) {
      setLastSavedContent(fastCaptureInitialValues.content);
    }
  }, [fastCaptureInitialValues]);

  const handleClipboardCapture = useCallback((captured: CapturedClipboardItem) => {
    setEditingItem(null);
    setFastCaptureInitialValues({
      title: captured.title,
      content: captured.content,
      type: captured.type,
      tags: captured.tags,
    });
    setIsAddModalVisible(true);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncStatus.syncAll();
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconBg, { backgroundColor: theme.inputBg }]}>
        <Ionicons
          name={searchQuery ? 'search-outline' : 'file-tray-outline'}
          size={36}
          color={theme.secondaryText}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {searchQuery ? 'No matching entries' : 'Your Inbox is empty'}
      </Text>
      <Text style={[styles.emptyDescription, { color: theme.secondaryText }]}>
        {searchQuery
          ? `No results for "${searchQuery}". Try adjusting your search query or filter.`
          : 'Save notes, links, and code snippets offline. Tap the + button below to create your first entry.'}
      </Text>
      {!searchQuery && (
        <Pressable
          onPress={handleOpenAddModal}
          style={({ pressed }) => [
            styles.emptyActionBtn,
            { backgroundColor: theme.tint, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Ionicons name="add" size={18} color="#ffffff" style={{ marginRight: 4 }} />
          <Text style={styles.emptyActionBtnText}>Create Entry</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            onToggleArchive={handleToggleArchive}
            onPress={handleCardPress}
          />
        )}
        ListHeaderComponent={
          <InboxHeader
            theme={theme}
            syncStatus={syncStatus}
            userEmail={user?.email}
            onOpenAuth={() => setIsAuthModalVisible(true)}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            selectedType={selectedType}
            onSelectType={handleSelectType}
            typeCounts={typeCounts}
          />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.tint}
            colors={[theme.tint]}
          />
        }
      />

      {/* Floating Action Button (FAB) */}
      <Pressable
        onPress={handleOpenAddModal}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Add new entry"
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.tint,
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}>
        <Ionicons name="add" size={32} color="#ffffff" style={styles.fabIcon} />
      </Pressable>

      {/* Bottom Sheet Add/Edit Item Modal */}
      <AddItemModal
        visible={isAddModalVisible}
        itemToEdit={editingItem}
        initialValues={fastCaptureInitialValues}
        onClose={handleCloseAddModal}
        onItemAdded={handleItemAdded}
      />

      {/* Account & Authentication Modal */}
      <AuthModal
        visible={isAuthModalVisible}
        onClose={() => setIsAuthModalVisible(false)}
      />

      {/* Automatic System Clipboard Capture Banner */}
      <ClipboardCaptureBanner
        onCapture={handleClipboardCapture}
        lastSavedContent={lastSavedContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 110,
  },
  headerContainer: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
    marginTop: 4,
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  syncPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 60,
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 32,
    zIndex: 999,
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
    }),
  },
  fabIcon: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});
