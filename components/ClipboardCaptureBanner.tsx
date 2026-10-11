import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getDatabase, type ItemType } from '@/lib/db/database';

export interface CapturedClipboardItem {
  title: string;
  content: string;
  type: ItemType;
  tags: string[];
}

interface ClipboardCaptureBannerProps {
  onCapture: (captured: CapturedClipboardItem) => void;
  lastSavedContent?: string | null;
}

export function ClipboardCaptureBanner({
  onCapture,
  lastSavedContent,
}: ClipboardCaptureBannerProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [pendingCapture, setPendingCapture] = useState<CapturedClipboardItem | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const dismissedContentRef = useRef<string | null>(null);

  // Smooth slide-up & fade-in animation values
  const translateY = useMemo(() => new Animated.Value(60), []);
  const opacity = useMemo(() => new Animated.Value(0), []);

  const showBanner = useCallback(() => {
    setIsVisible(true);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const hideBanner = useCallback(
    (onComplete?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 60,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
        setPendingCapture(null);
        onComplete?.();
      });
    },
    [opacity, translateY]
  );

  const inspectClipboard = useCallback(async () => {
    try {
      // In web, navigator.clipboard might require user interaction or permissions
      const hasString = await Clipboard.hasStringAsync();
      if (!hasString) return;

      const clip = await Clipboard.getStringAsync();
      if (!clip || typeof clip !== 'string') return;

      const text = clip.trim();
      // Guard against empty or absurdly large memory-consuming strings
      if (text.length === 0 || text.length > 50000) return;

      // Do not re-prompt if already dismissed in this session
      if (dismissedContentRef.current === text) return;

      // Do not prompt if it matches the last saved item
      if (lastSavedContent && lastSavedContent.trim() === text) return;

      // Check if an item with this exact content already exists in SQLite
      try {
        const db = getDatabase();
        const existing = db.getFirstSync<{ id: string }>(
          'SELECT id FROM items WHERE content = ? LIMIT 1',
          [text]
        );
        if (existing) {
          return;
        }
      } catch {
        // Ignore DB query errors
      }

      // Safe categorization and title derivation
      let detectedType: ItemType = 'note';
      let detectedTitle = '';

      // URL detection
      const isUrl =
        text.startsWith('http://') ||
        text.startsWith('https://') ||
        /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(text);

      if (isUrl) {
        detectedType = 'link';
        try {
          const parsed = new URL(text);
          const host = parsed.hostname.replace(/^www\./, '');
          const path = parsed.pathname !== '/' ? parsed.pathname.slice(0, 18) : '';
          detectedTitle = `${host}${path}`;
        } catch {
          detectedTitle = text.slice(0, 32);
        }
      } else {
        // Code snippet heuristics: keywords, symbols, multiline blocks
        const codeKeywords =
          /\b(function|const|let|var|class|import|export|def|return|interface|type|<[A-Za-z]+>)\b|[{};=><]/;
        const hasCodeSigns = codeKeywords.test(text);
        const isMultiLine = text.includes('\n');

        if (hasCodeSigns && (isMultiLine || text.length > 20)) {
          detectedType = 'code';
          const firstLine = text.split('\n')[0]?.trim() || '';
          detectedTitle = (firstLine.slice(0, 32) || 'Code Snippet').replace(/[{};]/g, '').trim();
        } else {
          detectedType = 'note';
          const firstLine = text.split('\n')[0]?.trim() || '';
          detectedTitle = firstLine.slice(0, 36) || 'New Note';
        }
      }

      setPendingCapture({
        title: detectedTitle,
        content: text,
        type: detectedType,
        tags: [detectedType],
      });
      showBanner();
    } catch (err) {
      // Gracefully swallow any clipboard parsing or permission issues
      console.debug('[ClipboardCapture] Ignored clipboard check error:', err);
    }
  }, [lastSavedContent, showBanner]);

  useEffect(() => {
    // Schedule check after initial render
    const timer = setTimeout(() => {
      inspectClipboard();
    }, 400);

    // Listen to foreground focus / app active transitions
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        inspectClipboard();
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [inspectClipboard]);

  const handleDismiss = () => {
    if (pendingCapture) {
      dismissedContentRef.current = pendingCapture.content;
    }
    hideBanner();
  };

  const handleSave = () => {
    if (pendingCapture) {
      const itemToSave = pendingCapture;
      dismissedContentRef.current = itemToSave.content;
      hideBanner(() => {
        onCapture(itemToSave);
      });
    }
  };

  if (!isVisible || !pendingCapture) {
    return null;
  }

  const iconName =
    pendingCapture.type === 'link'
      ? 'link-outline'
      : pendingCapture.type === 'code'
      ? 'code-slash-outline'
      : 'document-text-outline';

  const typeLabel =
    pendingCapture.type === 'link'
      ? 'link'
      : pendingCapture.type === 'code'
      ? 'code snippet'
      : 'text';

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        {
          backgroundColor: theme.surface,
          borderColor: theme.cardBorder,
          transform: [{ translateY }],
          opacity,
        },
      ]}>
      {/* Icon Badge */}
      <View style={[styles.iconBadge, { backgroundColor: `${theme.tint}18` }]}>
        <Ionicons name={iconName} size={18} color={theme.tint} />
      </View>

      {/* Text Info */}
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          Save copied {typeLabel} to Relay?
        </Text>
        <Text style={[styles.preview, { color: theme.secondaryText }]} numberOfLines={1}>
          {pendingCapture.content.replace(/\s+/g, ' ').slice(0, 50)}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleSave}
          hitSlop={6}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: theme.tint, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>

        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss clipboard suggestion"
          style={({ pressed }) => [
            styles.dismissBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}>
          <Ionicons name="close" size={20} color={theme.secondaryText} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    bottom: 96,
    left: 16,
    right: 16,
    zIndex: 900,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
    }),
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  preview: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  dismissBtn: {
    padding: 4,
  },
});
