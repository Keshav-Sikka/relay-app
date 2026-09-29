import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  Alert,
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { RelayItem } from '@/lib/db/database';

interface ItemCardProps {
  item: RelayItem;
  onToggleArchive: (id: string) => void;
  onDelete?: (id: string) => void;
  onPress?: (item: RelayItem) => void;
}

export function ItemCard({ item, onToggleArchive, onDelete, onPress }: ItemCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  // Swipe animation state
  const translateX = useMemo(() => new Animated.Value(0), []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Only capture horizontal swipes exceeding 10px
          return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onPanResponderMove: (_, gestureState) => {
          // Allow swiping left (negative dx)
          if (gestureState.dx < 0) {
            translateX.setValue(Math.max(-110, gestureState.dx));
          } else {
            translateX.setValue(Math.min(30, gestureState.dx * 0.2));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -65) {
            // Trigger archive / restore on swipe past threshold
            Animated.timing(translateX, {
              toValue: -90,
              duration: 140,
              useNativeDriver: true,
            }).start(() => {
              onToggleArchive(item.id);
              Animated.timing(translateX, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
              }).start();
            });
          } else {
            // Snap back
            Animated.spring(translateX, {
              toValue: 0,
              friction: 8,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [item.id, onToggleArchive, translateX]
  );

  const handleDeletePrompt = () => {
    if (!onDelete) return;
    Alert.alert('Delete Item', 'Are you sure you want to permanently delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete(item.id),
      },
    ]);
  };

  // Type badge styling
  const getTypeMeta = () => {
    switch (item.type) {
      case 'code':
        return {
          label: 'Code',
          color: theme.typeCode,
          icon: 'code-slash' as const,
        };
      case 'link':
        return {
          label: 'Link',
          color: theme.typeLink,
          icon: 'link' as const,
        };
      case 'image':
        return {
          label: 'Image',
          color: theme.typeImage || '#ec4899',
          icon: 'image' as const,
        };
      case 'note':
      default:
        return {
          label: 'Note',
          color: theme.typeNote,
          icon: 'document-text' as const,
        };
    }
  };

  const typeMeta = getTypeMeta();

  return (
    <View style={styles.cardWrapper}>
      {/* Background action revealed during swipe */}
      <View
        style={[
          styles.swipeActionBackground,
          {
            backgroundColor: item.isArchived ? theme.success : theme.warning,
          },
        ]}>
        <Ionicons
          name={item.isArchived ? 'refresh' : 'archive'}
          size={20}
          color="#ffffff"
        />
        <Text style={styles.swipeActionText}>
          {item.isArchived ? 'Restore' : 'Archive'}
        </Text>
      </View>

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardBorder,
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}>
        <Pressable
          onPress={() => onPress?.(item)}
          accessibilityRole="button"
          accessibilityLabel={`${typeMeta.label}: ${item.title || item.content}. Tap to view details.`}
          style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
          <View style={styles.headerRow}>
            <View style={styles.leftMeta}>
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: `${typeMeta.color}18` },
                ]}>
                <Ionicons name={typeMeta.icon} size={11} color={typeMeta.color} />
                <Text style={[styles.typeBadgeText, { color: typeMeta.color }]}>
                  {typeMeta.label}
                </Text>
              </View>
              <Text style={[styles.timeText, { color: theme.secondaryText }]}>
                {formatRelativeTime(item.updatedAt)}
              </Text>
            </View>

            <View style={styles.rightMeta}>
              <Pressable
                onPress={() => onToggleArchive(item.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={item.isArchived ? 'Restore item to inbox' : 'Archive item'}
                style={({ pressed }) => [
                  styles.miniActionBtn,
                  { opacity: pressed ? 0.6 : 1 },
                ]}>
                <Ionicons
                  name={item.isArchived ? 'refresh-outline' : 'archive-outline'}
                  size={15}
                  color={theme.secondaryText}
                />
              </Pressable>

              {item.isArchived && onDelete && (
                <Pressable
                  onPress={handleDeletePrompt}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Permanently delete item"
                  style={({ pressed }) => [
                    styles.miniActionBtn,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <Ionicons name="trash-outline" size={15} color={theme.danger} />
                </Pressable>
              )}
            </View>
          </View>

          {item.title.length > 0 && (
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
          )}

          {item.type === 'code' ? (
            <View style={[styles.codeBox, { backgroundColor: theme.codeBg }]}>
              <Text
                style={[
                  styles.codeText,
                  {
                    color: theme.codeText,
                    fontFamily: Platform.select({
                      ios: 'Menlo',
                      android: 'monospace',
                      default: 'monospace',
                    }),
                  },
                ]}
                numberOfLines={2}>
                {item.content}
              </Text>
            </View>
          ) : item.type === 'link' ? (
            <View
              style={[
                styles.linkBox,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}>
              <Ionicons name="link-outline" size={13} color={theme.typeLink} style={styles.linkIcon} />
              <Text style={[styles.linkText, { color: theme.typeLink }]} numberOfLines={1}>
                {item.content}
              </Text>
            </View>
          ) : item.type === 'image' ? (
            item.content.trim().length > 0 ? (
              <View style={[styles.imagePreviewContainer, { borderColor: theme.cardBorder }]}>
                <Image
                  source={{ uri: item.content }}
                  style={styles.imageThumbnail}
                  resizeMode="cover"
                />
              </View>
            ) : null
          ) : (
            <Text style={[styles.noteContent, { color: theme.secondaryText }]} numberOfLines={2}>
              {item.content}
            </Text>
          )}

          {item.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {item.tags.slice(0, 4).map((tag, idx) => (
                <View
                  key={`${tag}-${idx}`}
                  style={[styles.tagPill, { backgroundColor: theme.inputBg }]}>
                  <Text style={[styles.tagText, { color: theme.secondaryText }]}>
                    #{tag}
                  </Text>
                </View>
              ))}
              {item.tags.length > 4 && (
                <Text style={[styles.moreTagsText, { color: theme.secondaryText }]}>
                  +{item.tags.length - 4}
                </Text>
              )}
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: 16,
    marginBottom: 8,
    position: 'relative',
  },
  swipeActionBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 88,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 6,
  },
  swipeActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
      default: {},
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  leftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  timeText: {
    fontSize: 11,
  },
  rightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniActionBtn: {
    padding: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  noteContent: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  codeBox: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  codeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 4,
    gap: 5,
  },
  linkIcon: {
    marginRight: 1,
  },
  linkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  imagePreviewContainer: {
    width: '100%',
    height: 76,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  moreTagsText: {
    fontSize: 10,
    marginLeft: 2,
  },
});

