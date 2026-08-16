import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Body,
  Button,
  Card,
  Chip,
  ErrorNote,
  Eyebrow,
  Field,
  Heading,
  SuccessNote,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { deleteAccount } from '../data/admin';
import {
  changePassword,
  logoutUser,
  updateDisplayNameMetadata,
  verifyPassword,
} from '../data/auth';
import { updateProfile } from '../data/profiles';
import { collectEarnings } from '../data/reputation';
import { useTheme } from '../theme/ThemeProvider';
import { space, typography } from '../theme/tokens';

export function SettingsScreen({ navigation }: any) {
  const { colors, preference, setPreference } = useTheme();
  const { user, profile, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [collecting, setCollecting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setAvatarUrl(profile.avatarUrl);
  }, [profile]);

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, gap: space.lg }}>
        <Heading>Settings</Heading>
        <Body muted>Sign in to manage your account.</Body>
        <Button label="Sign in" onPress={() => navigation.navigate('Login')} />
        <ThemeSection preference={preference} setPreference={setPreference} />
      </View>
    );
  }

  const saveProfile = async () => {
    setError('');
    setNotice('');
    if (!displayName.trim()) return setError('Display name cannot be empty.');
    setSavingProfile(true);
    try {
      await updateProfile(user.id, {
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim(),
      });
      // The profiles table is the source of truth, but auth metadata is what
      // some surfaces read — keep the two from drifting.
      await updateDisplayNameMetadata(displayName.trim()).catch(() => {});
      await refreshProfile();
      setNotice('Profile saved.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    setError('');
    setNotice('');
    if (!currentPassword) return setError('Enter your current password.');
    if (newPassword.length < 6) return setError('New password must be at least 6 characters.');
    setSavingPassword(true);
    try {
      // Changing a password should require proving you know the current one.
      await verifyPassword(user.email!, currentPassword);
      await changePassword(newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password changed.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const collect = async () => {
    setError('');
    setNotice('');
    setCollecting(true);
    try {
      const { paid } = await collectEarnings();
      await refreshProfile();
      setNotice(paid > 0 ? `Collected ${paid} points.` : 'Nothing to collect right now.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCollecting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently removes your account and everything you published. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(user.id);
              await logoutUser();
            } catch (e: any) {
              setError(
                `${e.message} — account deletion needs the admin-actions Edge Function deployed.`
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.lg }}
    >
      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <View>
        <Eyebrow>Profile</Eyebrow>
        <View style={{ marginTop: space.md }}>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
          <Field label="Bio" value={bio} onChangeText={setBio} multiline autoCapitalize="sentences" />
          <Field
            label="Avatar URL"
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://…"
          />
          <Button label="Save profile" onPress={saveProfile} loading={savingProfile} />
        </View>
      </View>

      <ThemeSection preference={preference} setPreference={setPreference} />

      <Card>
        <Eyebrow>Earnings</Eyebrow>
        <Text style={[typography.small, { color: colors.textMuted, marginVertical: space.sm }]}>
          Points accumulate from what other people do with your work. Collecting pays out
          everything earned since the last time.
        </Text>
        <Button label="Collect earnings" variant="secondary" onPress={collect} loading={collecting} />
      </Card>

      <View>
        <Eyebrow>Password</Eyebrow>
        <View style={{ marginTop: space.md }}>
          <Field
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
          <Field
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            hint="At least 6 characters."
          />
          <Button
            label="Change password"
            variant="secondary"
            onPress={savePassword}
            loading={savingPassword}
          />
        </View>
      </View>

      <View
        style={{
          paddingTop: space.lg,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: colors.border,
          gap: space.sm,
        }}
      >
        <Button label="Sign out" icon="log-out" variant="secondary" onPress={() => logoutUser()} />
        <Button label="Delete my account" variant="danger" icon="trash-2" onPress={confirmDelete} />
        <Text style={[typography.small, { color: colors.textFaint }]}>
          Signed in as {user.email}
        </Text>
      </View>
    </ScrollView>
  );
}

function ThemeSection({ preference, setPreference }: any) {
  const { colors } = useTheme();
  return (
    <View>
      <Eyebrow>Appearance</Eyebrow>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        {[
          { id: 'system', label: 'System' },
          { id: 'light', label: 'Light' },
          { id: 'dark', label: 'Dark' },
        ].map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            active={preference === option.id}
            onPress={() => setPreference(option.id)}
          />
        ))}
      </View>
      <Text style={[typography.small, { color: colors.textFaint, marginTop: space.sm }]}>
        With no explicit choice, the app follows your phone's setting.
      </Text>
    </View>
  );
}
