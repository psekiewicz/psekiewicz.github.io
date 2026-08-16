import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import {
  Body,
  Button,
  ErrorNote,
  Eyebrow,
  Field,
  SuccessNote,
  Title,
} from '../components/ui';
import { loginUser, resetPassword } from '../data/auth';
import { useTheme } from '../theme/ThemeProvider';
import { space, typography } from '../theme/tokens';

export function LoginScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setNotice('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await loginUser(email.trim(), password);
      // No navigation here: AuthContext's listener fires and the gated screens
      // re-render themselves. Popping back is all that's left to do.
      if (navigation.canGoBack()) navigation.goBack();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your email address first, then tap "Forgot your password?".');
      return;
    }
    try {
      await resetPassword(email.trim());
      setNotice('Check your inbox for a password reset link.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xxl }}>
        <Eyebrow>Showcase</Eyebrow>
        <Title style={{ marginTop: space.xs, marginBottom: space.sm }}>Sign in</Title>
        <Body muted style={{ marginBottom: space.xl }}>
          Publish work, follow people, and keep your shelf.
        </Body>

        <ErrorNote message={error} />
        <SuccessNote message={notice} />

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
          placeholder="••••••••"
          secureTextEntry
        />

        <Button label="Sign in" onPress={submit} loading={busy} />

        <Pressable onPress={forgot} style={{ marginTop: space.lg, alignSelf: 'center' }}>
          <Text style={[typography.small, { color: colors.primary }]}>Forgot your password?</Text>
        </Pressable>

        <View
          style={{
            marginTop: space.xxl,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Text style={[typography.small, { color: colors.textMuted }]}>No account yet?</Text>
          <Pressable onPress={() => navigation.replace('Register')}>
            <Text style={[typography.small, { color: colors.primary, fontWeight: '700' }]}>
              Create one
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
