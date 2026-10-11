import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { useAuth } from '@/lib/auth/AuthContext';
import { useSyncStatus } from '@/lib/sync/syncEngine';
import { exportAllData, deleteAccountAndPurgeData } from '@/lib/storage/dataOwnership';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AuthModal({ visible, onClose }: AuthModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const { user, isConfigured, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const syncStatus = useSyncStatus();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        const result = await signInWithEmail(trimmedEmail, password);
        if (!result.success) {
          setErrorMessage(result.error || 'Invalid credentials or login failed.');
        } else {
          // Success, close modal
          handleClose();
        }
      } else {
        const result = await signUpWithEmail(trimmedEmail, password);
        if (!result.success) {
          setErrorMessage(result.error || 'Sign up failed.');
        } else {
          setSuccessMessage(result.message || 'Account created successfully!');
          if (result.message?.includes('check your email')) {
            // Keep message visible for user to read
          } else {
            handleClose();
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOutPrompt = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out? Your items remain safe in local SQLite.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          handleClose();
        },
      },
    ]);
  };

  const handleManualSync = async () => {
    await syncStatus.syncAll();
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const res = await exportAllData();
      if (!res.success) {
        Alert.alert('Export Failed', res.error || 'Could not export data.');
      } else {
        if (Platform.OS === 'web') {
          Alert.alert('Export Complete', `Exported ${res.itemCount} items as JSON.`);
        }
      }
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to export data.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePurgeDataPrompt = () => {
    Alert.alert(
      'Delete Account & Purge Data',
      `Permanently delete all your cloud items from Supabase (delete from items where user_id = auth.uid()), wipe local data in SQLite, reset the app to default sample state, and sign you out?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete & Purge',
          style: 'destructive',
          onPress: async () => {
            setIsPurging(true);
            try {
              const res = await deleteAccountAndPurgeData(user?.id);
              if (res.success) {
                await signOut();
                Alert.alert('Data Purged', 'Your account data has been permanently deleted.');
                handleClose();
              } else {
                Alert.alert('Purge Error', res.error || 'Failed to complete purge.');
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Purge failed.');
            } finally {
              setIsPurging(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
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
            <View>
              <View style={[styles.pillHandle, { backgroundColor: theme.inputBorder }]} />
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                {user ? 'Account & Cloud Sync' : 'Relay Cloud'}
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="close" size={22} color={theme.secondaryText} />
            </Pressable>
          </View>

          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            {/* If Signed In: Account Profile Card */}
            {user ? (
              <View style={styles.signedInContainer}>
                <View style={[styles.profileCard, { backgroundColor: theme.inputBg, borderColor: theme.cardBorder }]}>
                  <View style={[styles.avatarCircle, { backgroundColor: theme.tint }]}>
                    <Text style={styles.avatarText}>
                      {(user.email?.[0] || 'U').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.profileDetails}>
                    <Text style={[styles.profileEmail, { color: theme.text }]} numberOfLines={1}>
                      {user.email}
                    </Text>
                    <View style={styles.statusBadgeRow}>
                      <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
                      <Text style={[styles.statusBadgeText, { color: theme.success }]}>
                        Cloud Sync Active
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Sync Summary info */}
                <View style={[styles.infoBox, { backgroundColor: `${theme.tint}10`, borderColor: `${theme.tint}30` }]}>
                  <Ionicons name="cloud-done-outline" size={20} color={theme.tint} style={{ marginRight: 8 }} />
                  <Text style={[styles.infoBoxText, { color: theme.text }]}>
                    Your notes, links, code, and images are synchronized across devices using Supabase.
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionSection}>
                  <Pressable
                    onPress={handleManualSync}
                    disabled={syncStatus.state === 'syncing'}
                    style={({ pressed }) => [
                      styles.syncBtn,
                      {
                        backgroundColor: theme.tint,
                        opacity: pressed || syncStatus.state === 'syncing' ? 0.7 : 1,
                      },
                    ]}>
                    {syncStatus.state === 'syncing' ? (
                      <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                    ) : (
                      <Ionicons name="refresh" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                    )}
                    <Text style={styles.syncBtnText}>
                      {syncStatus.state === 'syncing' ? 'Syncing...' : 'Sync Now'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleSignOutPrompt}
                    style={({ pressed }) => [
                      styles.signOutBtn,
                      {
                        backgroundColor: `${theme.danger}15`,
                        borderColor: `${theme.danger}30`,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <Ionicons name="log-out-outline" size={18} color={theme.danger} style={{ marginRight: 8 }} />
                    <Text style={[styles.signOutBtnText, { color: theme.danger }]}>Sign Out</Text>
                  </Pressable>
                </View>

                {/* Data Ownership & Privacy */}
                <View
                  style={[
                    styles.dataOwnershipCard,
                    { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
                  ]}>
                  <View style={styles.dataOwnershipHeader}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={18}
                      color={theme.tint}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.dataOwnershipTitle, { color: theme.text }]}>
                      Data Ownership & Privacy
                    </Text>
                  </View>
                  <Text style={[styles.dataOwnershipDesc, { color: theme.secondaryText }]}>
                    Export all your local records into a portable JSON file, or permanently delete your account and all associated cloud data.
                  </Text>

                  <View style={styles.dataOwnershipButtons}>
                    {/* Export All Data */}
                    <Pressable
                      onPress={handleExportData}
                      disabled={isExporting}
                      style={({ pressed }) => [
                        styles.exportBtn,
                        {
                          backgroundColor: `${theme.tint}18`,
                          borderColor: `${theme.tint}40`,
                          opacity: pressed || isExporting ? 0.7 : 1,
                        },
                      ]}>
                      {isExporting ? (
                        <ActivityIndicator size="small" color={theme.tint} style={{ marginRight: 8 }} />
                      ) : (
                        <Ionicons name="share-outline" size={18} color={theme.tint} style={{ marginRight: 8 }} />
                      )}
                      <Text style={[styles.exportBtnText, { color: theme.tint }]}>
                        {isExporting ? 'Exporting...' : 'Export All Data (JSON)'}
                      </Text>
                    </Pressable>

                    {/* Delete Account & Purge Data */}
                    <Pressable
                      onPress={handlePurgeDataPrompt}
                      disabled={isPurging}
                      style={({ pressed }) => [
                        styles.purgeBtn,
                        {
                          backgroundColor: `${theme.danger}15`,
                          borderColor: `${theme.danger}35`,
                          opacity: pressed || isPurging ? 0.7 : 1,
                        },
                      ]}>
                      {isPurging ? (
                        <ActivityIndicator size="small" color={theme.danger} style={{ marginRight: 8 }} />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color={theme.danger} style={{ marginRight: 8 }} />
                      )}
                      <Text style={[styles.purgeBtnText, { color: theme.danger }]}>
                        {isPurging ? 'Purging...' : 'Delete Account & Purge Data'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              /* If Signed Out: Sign In / Sign Up Form */
              <View style={styles.authFormContainer}>
                {/* Segmented Mode Selector */}
                <View style={[styles.modeSelector, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                  <Pressable
                    onPress={() => {
                      setMode('signin');
                      setErrorMessage(null);
                    }}
                    style={[styles.modeOption, mode === 'signin' && { backgroundColor: theme.card }]}>
                    <Text
                      style={[
                        styles.modeOptionText,
                        {
                          color: mode === 'signin' ? theme.text : theme.secondaryText,
                          fontWeight: mode === 'signin' ? '700' : '500',
                        },
                      ]}>
                      Sign In
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setMode('signup');
                      setErrorMessage(null);
                    }}
                    style={[styles.modeOption, mode === 'signup' && { backgroundColor: theme.card }]}>
                    <Text
                      style={[
                        styles.modeOptionText,
                        {
                          color: mode === 'signup' ? theme.text : theme.secondaryText,
                          fontWeight: mode === 'signup' ? '700' : '500',
                        },
                      ]}>
                      Create Account
                    </Text>
                  </Pressable>
                </View>

                {!isConfigured && (
                  <View style={[styles.infoBox, { backgroundColor: `${theme.warning}15`, borderColor: `${theme.warning}40` }]}>
                    <Ionicons name="information-circle-outline" size={18} color={theme.warning} style={{ marginRight: 8 }} />
                    <Text style={[styles.infoBoxText, { color: theme.text }]}>
                      Supabase anon key is currently not configured in .env. Working in offline mode.
                    </Text>
                  </View>
                )}

                {/* Email Input */}
                <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>EMAIL</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                      color: theme.text,
                    },
                  ]}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="name@example.com"
                  placeholderTextColor={theme.secondaryText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />

                {/* Password Input */}
                <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>PASSWORD</Text>
                <View
                  style={[
                    styles.passwordContainer,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                    },
                  ]}>
                  <TextInput
                    style={[styles.passwordInput, { color: theme.text }]}
                    value={password}
                    onChangeText={(val) => {
                      setPassword(val);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="At least 6 characters"
                    placeholderTextColor={theme.secondaryText}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={8}
                    style={styles.eyeBtn}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={theme.secondaryText}
                    />
                  </Pressable>
                </View>

                {/* Confirm Password (if sign up) */}
                {mode === 'signup' && (
                  <>
                    <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>CONFIRM PASSWORD</Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor: theme.inputBorder,
                          color: theme.text,
                        },
                      ]}
                      value={confirmPassword}
                      onChangeText={(val) => {
                        setConfirmPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Repeat your password"
                      placeholderTextColor={theme.secondaryText}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                  </>
                )}

                {/* Error Banner */}
                {errorMessage && (
                  <View style={[styles.alertBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
                    <Ionicons name="alert-circle" size={16} color={theme.danger} style={{ marginRight: 6 }} />
                    <Text style={[styles.alertBannerText, { color: theme.danger }]}>{errorMessage}</Text>
                  </View>
                )}

                {/* Success Banner */}
                {successMessage && (
                  <View style={[styles.alertBanner, { backgroundColor: `${theme.success}15`, borderColor: `${theme.success}30` }]}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.success} style={{ marginRight: 6 }} />
                    <Text style={[styles.alertBannerText, { color: theme.success }]}>{successMessage}</Text>
                  </View>
                )}

                {/* Submit Button */}
                <Pressable
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    {
                      backgroundColor: theme.tint,
                      opacity: pressed || isSubmitting ? 0.8 : 1,
                    },
                  ]}>
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                  ) : (
                    <Ionicons
                      name={mode === 'signin' ? 'log-in-outline' : 'person-add-outline'}
                      size={18}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text style={styles.submitBtnText}>
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  </Text>
                </Pressable>

                <Text style={[styles.disclaimer, { color: theme.secondaryText }]}>
                  Your data is always preserved in local offline SQLite even when offline or signed out.
                </Text>

                {/* Export Data for offline users */}
                <Pressable
                  onPress={handleExportData}
                  disabled={isExporting}
                  style={({ pressed }) => [
                    styles.exportBtn,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                      marginTop: 14,
                      opacity: pressed || isExporting ? 0.7 : 1,
                    },
                  ]}>
                  {isExporting ? (
                    <ActivityIndicator size="small" color={theme.tint} style={{ marginRight: 8 }} />
                  ) : (
                    <Ionicons name="download-outline" size={17} color={theme.tint} style={{ marginRight: 8 }} />
                  )}
                  <Text style={[styles.exportBtnText, { color: theme.tint }]}>
                    {isExporting ? 'Exporting...' : 'Export Local Data (JSON)'}
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
    maxHeight: '85%',
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
  pillHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  signedInContainer: {
    gap: 16,
    paddingBottom: 30,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  profileDetails: {
    flex: 1,
  },
  profileEmail: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 8,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  actionSection: {
    gap: 10,
    marginTop: 8,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  signOutBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  authFormContainer: {
    paddingBottom: 40,
  },
  modeSelector: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
  },
  modeOption: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  modeOptionText: {
    fontSize: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
  },
  eyeBtn: {
    padding: 6,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
  },
  alertBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 18,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
  dataOwnershipCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
  },
  dataOwnershipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dataOwnershipTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  dataOwnershipDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  dataOwnershipButtons: {
    gap: 10,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  exportBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  purgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  purgeBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
