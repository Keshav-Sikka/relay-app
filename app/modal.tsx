import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { ItemForm } from '@/components/ItemForm';
import { getItemById, insertItem, updateItem, type CreateItemInput } from '@/lib/db/database';

export default function ModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const existingItem = params.id ? getItemById(params.id) : null;
  const isEditing = Boolean(existingItem);

  const handleSubmit = (input: CreateItemInput) => {
    if (existingItem) {
      updateItem(existingItem.id, {
        title: input.title,
        content: input.content,
        type: input.type,
        tags: input.tags,
      });
    } else {
      insertItem(input);
    }
    router.back();
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.surface }]}>
      <View style={styles.container}>
        <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {isEditing ? 'Edit Relay Entry' : 'New Relay Entry'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.secondaryText }]}>
            Stored locally in offline SQLite
          </Text>
        </View>

        <ItemForm
          initialValues={existingItem ?? undefined}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel={isEditing ? 'Save Changes' : 'Save to Relay'}
        />
      </View>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
});
