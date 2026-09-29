import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { ItemForm } from './ItemForm';
import { insertItem, updateItem, type CreateItemInput, type RelayItem } from '@/lib/db/database';

export interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onItemAdded?: () => void;
  itemToEdit?: RelayItem | null;
  initialValues?: Partial<CreateItemInput> | null;
}

export function AddItemModal({
  visible,
  onClose,
  onItemAdded,
  itemToEdit,
  initialValues,
}: AddItemModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const handleSubmit = (input: CreateItemInput) => {
    if (itemToEdit) {
      updateItem(itemToEdit.id, {
        title: input.title,
        content: input.content,
        type: input.type,
        tags: input.tags,
      });
    } else {
      insertItem(input);
    }
    if (onItemAdded) {
      onItemAdded();
    }
    onClose();
  };

  const isEditing = Boolean(itemToEdit);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.surface,
              borderColor: theme.cardBorder,
            },
          ]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.pillHandle, { backgroundColor: theme.inputBorder }]} />
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                {isEditing ? 'Edit Entry' : 'New Entry'}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="close" size={22} color={theme.secondaryText} />
            </Pressable>
          </View>

          {/* Form */}
          <ItemForm
            key={itemToEdit ? itemToEdit.id : initialValues ? `capture-${initialValues.content?.slice(0, 8)}` : 'new-entry'}
            initialValues={itemToEdit ?? initialValues ?? undefined}
            onSubmit={handleSubmit}
            onCancel={onClose}
            submitLabel={isEditing ? 'Save Changes' : 'Save to Relay'}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const ItemModal = AddItemModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: '90%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    alignItems: 'flex-start',
  },
  pillHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
    alignSelf: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
});
