import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Body, Button, ErrorNote, Eyebrow, Field, SuccessNote, Title } from '../components/ui';
import { registerUser } from '../data/auth';
import { useTheme } from '../theme/ThemeProvider';
import { space, typography } from '../theme/tokens';

export function RegisterScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setNotice('');
    if (!displayName.trim()) return setError('Choose a display name.');
    if (!email.trim()) return setError('Enter your email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters long.');
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    try {
      const { session } = await registerUser(email.trim(), password, displayName.trim());
      if (session) {
        // Signed straight in — the auth listener takes it from here.
        navigation.goBack();
      } else {
        // Email confirmation is on (Supabase's default), so there is no
        // session yet and telling them they're logged in would be a lie.
        setNotice(
          'Account created. Check your inbox and confirm your email address, then sign in.'
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xxl }}>
        <Eyebrow>Showcase</Eyebrow>
        <Title style={{ marginTop: space.xs, marginBottom: space.sm }}>Create account</Title>
        <Body muted style={{ marginBottom: space.xl }}>
          Free, and takes about a minute.
        </Body>

        <ErrorNote message={error} />
        <SuccessNote message={notice} />

        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="How you'll appear"
          autoCapitalize="words"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
        />
        <Field
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Type it again"
          secureTextEntry
        />

        <Button label="Create account" onPress={submit} loading={busy} />

        <View
          style={{ marginTop: space.xxl, flexDirection: 'row', justifyContent: 'center', gap: 6 }}
        >
          <Text style={[typography.small, { color: colors.textMuted }]}>Already have an account?</Text>
          <Pressable onPress={() => navigation.replace('Login')}>
            <Text style={[typography.small, { color: colors.primary, fontWeight: '700' }]}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
