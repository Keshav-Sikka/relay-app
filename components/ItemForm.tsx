import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { CreateItemInput, ItemType } from '@/lib/db/database';

interface ItemFormProps {
  initialValues?: Partial<CreateItemInput>;
  onSubmit: (item: CreateItemInput) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function ItemForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save to Relay',
}: ItemFormProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [type, setType] = useState<ItemType>(initialValues?.type ?? 'note');
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [content, setContent] = useState(initialValues?.content ?? '');
  const [tagsInput, setTagsInput] = useState(() => {
    if (Array.isArray(initialValues?.tags)) {
      return initialValues.tags.join(', ');
    }
    return (initialValues?.tags as string) ?? '';
  });
  const [error, setError] = useState<string | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyContent = async () => {
    if (!content.trim()) return;
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenUrl = async () => {
    let url = content.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      await Linking.openURL(url);
    }
  };

  // Live parsed tags preview
  const parsedTags = useMemo(() => {
    return tagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#+/, ''))
      .filter(Boolean);
  }, [tagsInput]);

  const pickImage = async () => {
    try {
      setIsPickingImage(true);
      setError(null);
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setError('Permission to access photo library is required.');
        setIsPickingImage(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setContent(asset.uri);
        setError(null);
        if (!title.trim() && asset.fileName) {
          setTitle(asset.fileName);
        }
      }
    } catch (err: any) {
      console.error('[ItemForm] Image picker error:', err);
      setError(err?.message || 'Failed to select image.');
    } finally {
      setIsPickingImage(false);
    }
  };

  const handleSubmit = () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (type === 'image' && !trimmedContent) {
      setError('Please select an image from your library.');
      return;
    }

    if (!trimmedTitle && !trimmedContent) {
      setError('Please provide at least a title or content for your entry.');
      return;
    }

    setError(null);
    onSubmit({
      title: trimmedTitle,
      content: trimmedContent,
      type,
      tags: parsedTags,
      isArchived: initialValues?.isArchived ? (initialValues.isArchived as boolean) : false,
    });
  };

  const typeOptions: { id: ItemType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { id: 'note', label: 'Note', icon: 'document-text-outline', color: theme.typeNote },
    { id: 'link', label: 'Link', icon: 'link-outline', color: theme.typeLink },
    { id: 'code', label: 'Code', icon: 'code-slash-outline', color: theme.typeCode },
    { id: 'image', label: 'Image', icon: 'image-outline', color: theme.typeImage || '#ec4899' },
  ];

  const contentPlaceholder =
    type === 'code'
      ? 'const handleSync = async () => {\n  // Code snippet here...\n};'
      : type === 'link'
      ? 'https://example.com/article'
      : 'Write your note or thoughts here...';

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Type Selector Segmented Control */}
      <Text style={[styles.label, { color: theme.secondaryText }]}>ENTRY TYPE</Text>
      <View style={[styles.typeSelector, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        {typeOptions.map((opt) => {
          const isSelected = type === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setType(opt.id)}
              style={({ pressed }) => [
                styles.typeOption,
                isSelected && {
                  backgroundColor: theme.card,
                  ...Platform.select({
                    ios: {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                    },
                    android: { elevation: 2 },
                  }),
                },
                { opacity: pressed ? 0.7 : 1 },
              ]}>
              <Ionicons
                name={opt.icon}
                size={16}
                color={isSelected ? opt.color : theme.secondaryText}
                style={styles.typeIcon}
              />
              <Text
                style={[
                  styles.typeOptionText,
                  {
                    color: isSelected ? theme.text : theme.secondaryText,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Image Picker Area if Type is 'image' */}
      {type === 'image' ? (
        <View style={styles.imageSection}>
          <Text style={[styles.label, { color: theme.secondaryText }]}>IMAGE</Text>
          {content.trim().length > 0 ? (
            <View style={[styles.imagePreviewBox, { borderColor: theme.cardBorder, backgroundColor: theme.inputBg }]}>
              <Image source={{ uri: content }} style={styles.imagePreview} resizeMode="cover" />
              <View style={styles.imageActionButtons}>
                <Pressable
                  onPress={pickImage}
                  disabled={isPickingImage}
                  style={({ pressed }) => [
                    styles.imageActionBtn,
                    { backgroundColor: theme.card, borderColor: theme.cardBorder, opacity: pressed ? 0.8 : 1 },
                  ]}>
                  <Ionicons name="images-outline" size={15} color={theme.text} style={{ marginRight: 6 }} />
                  <Text style={[styles.imageActionText, { color: theme.text }]}>Change Image</Text>
                </Pressable>
                <Pressable
                  onPress={() => setContent('')}
                  style={({ pressed }) => [
                    styles.imageActionBtn,
                    { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30`, opacity: pressed ? 0.8 : 1 },
                  ]}>
                  <Ionicons name="trash-outline" size={15} color={theme.danger} style={{ marginRight: 6 }} />
                  <Text style={[styles.imageActionText, { color: theme.danger }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={pickImage}
              disabled={isPickingImage}
              style={({ pressed }) => [
                styles.imagePickerDropzone,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              {isPickingImage ? (
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <>
                  <View style={[styles.pickerIconCircle, { backgroundColor: `${theme.typeImage || '#ec4899'}18` }]}>
                    <Ionicons name="image-outline" size={28} color={theme.typeImage || '#ec4899'} />
                  </View>
                  <Text style={[styles.pickerTitle, { color: theme.text }]}>Choose Photo from Library</Text>
                  <Text style={[styles.pickerSubtitle, { color: theme.secondaryText }]}>
                    PNG, JPG, HEIC supported
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Title Input */}
      <Text style={[styles.label, { color: theme.secondaryText }]}>
        {type === 'image' ? 'TITLE / CAPTION (OPTIONAL)' : 'TITLE'}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            color: theme.text,
          },
        ]}
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (error) setError(null);
        }}
        placeholder={
          type === 'link'
            ? 'Site or Document Title'
            : type === 'code'
            ? 'Snippet Description / Function Name'
            : type === 'image'
            ? 'Add a caption or title for this image'
            : 'Note Title'
        }
        placeholderTextColor={theme.secondaryText}
        autoCapitalize="sentences"
      />

      {/* Content Input (for Note, Link, Code) */}
      {type !== 'image' && (
        <>
          <View style={styles.labelActionRow}>
            <Text style={[styles.label, { color: theme.secondaryText, marginTop: 0, marginBottom: 0 }]}>
              {type === 'link' ? 'URL' : type === 'code' ? 'CODE SNIPPET' : 'CONTENT'}
            </Text>
            {content.trim().length > 0 && (
              <View style={styles.contentActions}>
                {type === 'link' && (
                  <Pressable
                    onPress={handleOpenUrl}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.inlineActionBtn,
                      { backgroundColor: `${theme.typeLink}16`, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <Ionicons name="open-outline" size={13} color={theme.typeLink} style={{ marginRight: 3 }} />
                    <Text style={[styles.inlineActionText, { color: theme.typeLink }]}>Open Link</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleCopyContent}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.inlineActionBtn,
                    {
                      backgroundColor: copied ? `${theme.success}18` : theme.inputBg,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={13}
                    color={copied ? theme.success : theme.secondaryText}
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={[
                      styles.inlineActionText,
                      { color: copied ? theme.success : theme.secondaryText },
                    ]}>
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
          <TextInput
            style={[
              styles.input,
              styles.contentInput,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.text,
                fontFamily:
                  type === 'code'
                    ? Platform.select({
                        ios: 'Menlo',
                        android: 'monospace',
                        default: 'monospace',
                      })
                    : undefined,
              },
            ]}
            value={content}
            onChangeText={(text) => {
              setContent(text);
              if (error) setError(null);
            }}
            placeholder={contentPlaceholder}
            placeholderTextColor={theme.secondaryText}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            autoCapitalize={type === 'link' || type === 'code' ? 'none' : 'sentences'}
            autoCorrect={type !== 'code' && type !== 'link'}
            keyboardType={type === 'link' ? 'url' : 'default'}
          />
        </>
      )}

      {/* Tags Input */}
      <Text style={[styles.label, { color: theme.secondaryText }]}>TAGS (COMMA SEPARATED)</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            color: theme.text,
          },
        ]}
        value={tagsInput}
        onChangeText={setTagsInput}
        placeholder="e.g. mobile, expo, react (comma-separated)"
        placeholderTextColor={theme.secondaryText}
        autoCapitalize="none"
      />
      <Text style={[styles.helperCaption, { color: theme.secondaryText }]}>
        Separate tags with commas (e.g. mobile, expo, react)
      </Text>

      {/* Live Tags Preview */}
      {parsedTags.length > 0 && (
        <View style={styles.tagPreviewContainer}>
          {parsedTags.map((tag, i) => (
            <View key={i} style={[styles.tagBadge, { backgroundColor: `${theme.tint}18` }]}>
              <Text style={[styles.tagBadgeText, { color: theme.tint }]}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Validation Error */}
      {error && (
        <View style={[styles.errorContainer, { backgroundColor: `${theme.danger}15` }]}>
          <Ionicons name="alert-circle" size={16} color={theme.danger} />
          <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
        </View>
      )}

      {/* Buttons */}
      <View style={styles.buttonRow}>
        {onCancel && (
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelBtn,
              {
                borderColor: theme.inputBorder,
                backgroundColor: theme.inputBg,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <Text style={[styles.cancelBtnText, { color: theme.secondaryText }]}>Cancel</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor: theme.tint,
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <Ionicons name="checkmark" size={18} color="#ffffff" style={{ marginRight: 6 }} />
          <Text style={styles.submitBtnText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  labelActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  contentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inlineActionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  typeSelector: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 6,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  typeIcon: {
    marginRight: 6,
  },
  typeOptionText: {
    fontSize: 13,
  },
  imageSection: {
    marginTop: 4,
  },
  imagePickerDropzone: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  pickerIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 12,
  },
  imagePreviewBox: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
  },
  imageActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  imageActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  contentInput: {
    minHeight: 120,
    paddingTop: 12,
  },
  helperCaption: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 16,
  },
  tagPreviewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
