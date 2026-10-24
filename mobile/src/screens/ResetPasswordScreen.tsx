import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { Body, Button, ErrorNote, Field, SuccessNote, Title } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { changePassword } from '../data/auth';
import { column } from '../lib/layout';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, space } from '../theme/tokens';

// Where a password-reset email lands (lib/authLinks.ts has already turned the
// link into a session): pick a new password, and that's it. The native side
// of the site's login.html?reset=1.
export function ResetPasswordScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    if (password.length < 6) return setError('Use at least 6 characters.');
    if (password !== repeat) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await changePassword(password);
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ ...column(), padding: gutter, gap: space.md }} keyboardShouldPersistTaps="handled">
        <Title>New password</Title>
        {!user ? (
          <ErrorNote message="This reset link has expired. Ask for a new one from Sign in → Forgot your password?" />
        ) : done ? (
          <>
            <SuccessNote message="Your password is changed, and you're signed in." />
            <Button label="Continue" onPress={() => navigation.navigate('Tabs')} />
          </>
        ) : (
          <>
            <Body muted>For {user.email}.</Body>
            <ErrorNote message={error} />
            <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
            <Field label="Repeat it" value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password" />
            <Button label="Save new password" icon="check" onPress={save} loading={busy} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
