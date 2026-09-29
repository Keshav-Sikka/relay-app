import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
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
import { deleteItem, toggleArchive, useRelayItems, type RelayItem } from '@/lib/db/database';

export default function ArchiveScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [selectedType, setSelectedType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingItem, setEditingItem] = useState<RelayItem | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  // Load archived items reactively from SQLite
  const { items, refresh } = useRelayItems({
    archived: true,
    type: selectedType === 'all' ? undefined : selectedType,
    query: searchQuery,
  });

  // Query all archived items to calculate badge counts
  const { items: allArchivedItems } = useRelayItems({ archived: true });

  const typeCounts = useMemo(() => {
    const counts: Record<FilterType, number> = {
      all: allArchivedItems.length,
      note: 0,
      link: 0,
      code: 0,
      image: 0,
    };
    for (const item of allArchivedItems) {
      if (item.type in counts) {
        counts[item.type as FilterType]++;
      }
    }
    return counts;
  }, [allArchivedItems]);

  const handleToggleArchive = (id: string) => {
    toggleArchive(id);
  };

  const handleDelete = (id: string) => {
    deleteItem(id);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.titleRow}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Archive</Text>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            {allArchivedItems.length === 1
              ? '1 archived item preserved offline'
              : `${allArchivedItems.length} archived items preserved offline`}
          </Text>
        </View>
      </View>

      {/* Search Input */}
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search archive..."
      />

      {/* Category Filter Chips */}
      <TypeFilterChips
        selectedType={selectedType}
        onSelectType={setSelectedType}
        counts={typeCounts}
      />
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconBg, { backgroundColor: theme.inputBg }]}>
        <Ionicons
          name={searchQuery ? 'search-outline' : 'archive-outline'}
          size={36}
          color={theme.secondaryText}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {searchQuery ? 'No matching archived items' : 'No items archived'}
      </Text>
      <Text style={[styles.emptyDescription, { color: theme.secondaryText }]}>
        {searchQuery
          ? `No archived items match "${searchQuery}".`
          : 'Items you archive from your inbox are stored here offline. You can restore them to your inbox at any time.'}
      </Text>
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
            onDelete={handleDelete}
            onPress={(selected) => {
              setEditingItem(selected);
              setIsEditModalVisible(true);
            }}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.tint}
            colors={[theme.tint]}
          />
        }
      />

      <AddItemModal
        visible={isEditModalVisible}
        itemToEdit={editingItem}
        onClose={() => {
          setIsEditModalVisible(false);
          setEditingItem(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  headerContainer: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
    marginTop: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
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
  },
});
