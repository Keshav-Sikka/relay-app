import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export type FilterType = 'all' | 'note' | 'link' | 'code' | 'image';

interface FilterOption {
  id: FilterType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all', label: 'All', icon: 'layers-outline' },
  { id: 'note', label: 'Notes', icon: 'document-text-outline' },
  { id: 'link', label: 'Links', icon: 'link-outline' },
  { id: 'code', label: 'Code', icon: 'code-slash-outline' },
  { id: 'image', label: 'Images', icon: 'image-outline' },
];

interface TypeFilterChipsProps {
  selectedType: FilterType;
  onSelectType: (type: FilterType) => void;
  counts?: Partial<Record<FilterType, number>>;
}

export function TypeFilterChips({ selectedType, onSelectType, counts }: TypeFilterChipsProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {FILTER_OPTIONS.map((item) => {
        const isSelected = selectedType === item.id;
        const count = counts ? counts[item.id] : undefined;

        return (
          <Pressable
            key={item.id}
            onPress={() => onSelectType(item.id)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: isSelected ? theme.chipActiveBg : theme.chipInactiveBg,
                borderColor: isSelected ? theme.chipActiveBg : theme.cardBorder,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <Ionicons
              name={item.icon}
              size={15}
              color={isSelected ? theme.chipActiveText : theme.chipInactiveText}
              style={styles.chipIcon}
            />
            <Text
              style={[
                styles.chipText,
                {
                  color: isSelected ? theme.chipActiveText : theme.chipInactiveText,
                  fontWeight: isSelected ? '600' : '500',
                },
              ]}>
              {item.label}
            </Text>
            {count !== undefined && count > 0 && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isSelected
                      ? 'rgba(255, 255, 255, 0.25)'
                      : theme.inputBorder,
                  },
                ]}>
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: isSelected ? '#ffffff' : theme.secondaryText,
                    },
                  ]}>
                  {count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
  },
  badge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
