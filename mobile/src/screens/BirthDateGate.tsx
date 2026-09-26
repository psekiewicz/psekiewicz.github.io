import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '../components/Text';
import { Button, ErrorNote, Eyebrow } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { requestParentalConsent, setBirthDate } from '../data/age';
import { logoutUser } from '../data/auth';
import { column } from '../lib/layout';
import { MINIMUM_AGE } from '../legal/documents';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

// Stands in front of the app for an account with no date of birth on it.
//
// Every account made before the age rules existed is in that position, and so
// is anyone who signed up through a client that did not ask yet. The database
// refuses their writes either way; this is what gives them a way to fix that
// rather than a wall of failures with no explanation.
//
// Three numeric fields rather than a date picker: no extra dependency, it
// works the same on every Android version, and typing a year is faster than
// scrolling sixteen of them.

type Step = 'ask' | 'parent' | 'sent';

function pad(value: string, length: number) {
  return value.padStart(length, '0');
}

export function BirthDateGate({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('ask');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentConfirmed, setParentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submitDate = async () => {
    setError('');
    const d = Number(day);
    const m = Number(month);
    const y = Number(year);
    if (!d || !m || !y || year.length !== 4) {
      return setError('Fill in the day, month and year.');
    }
    if (d < 1 || d > 31 || m < 1 || m > 12) {
      return setError('That date does not look right.');
    }
    const iso = `${y}-${pad(String(m), 2)}-${pad(String(d), 2)}`;
    // Round-trips through Date to catch the 31st of February and similar.
    const parsed = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== d || parsed.getUTCMonth() + 1 !== m) {
      return setError('That date does not exist.');
    }

    setBusy(true);
    try {
      const state = await setBirthDate(iso);
      // The server decides. 'pending' means 13-15, so a parent has to agree
      // before the account can post anything.
      if (state === 'pending') setStep('parent');
      else onDone();
    } catch (e: any) {
      setError(e.message || 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const submitParent = async () => {
    setError('');
    if (!parentConfirmed) {
      return setError('Confirm that this is a parent or guardian’s address.');
    }
    setBusy(true);
    try {
      await requestParentalConsent(parentEmail.trim());
      setStep('sent');
    } catch (e: any) {
      setError(e.message || 'The email could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          ...column(),
          padding: space.xl,
          paddingTop: insets.top + space.xxl,
          paddingBottom: insets.bottom + space.xxl,
          gap: space.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'ask' ? (
          <>
            <View style={{ gap: 8 }}>
              <Eyebrow>One thing first</Eyebrow>
              <Text style={[typography.h2, { color: colors.text }]}>How old are you?</Text>
              <Text style={[typography.body, { color: colors.textMuted }]}>
                Showcase needs a date of birth on every account. Accounts held by under
                16s need a parent or guardian to agree before they can post, and there
                is no way to know which those are without asking.
              </Text>
            </View>

            <ErrorNote message={error} />

            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {[
                { label: 'DAY', value: day, set: setDay, max: 2, placeholder: 'DD', flex: 1 },
                { label: 'MONTH', value: month, set: setMonth, max: 2, placeholder: 'MM', flex: 1 },
                { label: 'YEAR', value: year, set: setYear, max: 4, placeholder: 'YYYY', flex: 1.4 },
              ].map((field) => (
                <View key={field.label} style={{ flex: field.flex, gap: 6 }}>
                  <Eyebrow>{field.label}</Eyebrow>
                  <TextInput
                    value={field.value}
                    onChangeText={(t: string) => field.set(t.replace(/[^0-9]/g, '').slice(0, field.max))}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                    maxLength={field.max}
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radius.md,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: colors.text,
                      fontSize: 16,
                    }}
                  />
                </View>
              ))}
            </View>

            <Text style={[typography.small, { color: colors.textFaint }]}>
              It is not shown on your profile, and it cannot be changed afterwards - so
              get it right. You must be at least {MINIMUM_AGE} to hold an account.
            </Text>

            <Button label="Continue" onPress={submitDate} loading={busy} />
            <Button
              label="Sign out"
              variant="ghost"
              onPress={() => logoutUser()}
              style={{ alignSelf: 'center' }}
            />
          </>
        ) : null}

        {step === 'parent' ? (
          <>
            <View style={{ gap: 8 }}>
              <Eyebrow>Almost there</Eyebrow>
              <Text style={[typography.h2, { color: colors.text }]}>
                A parent needs to agree
              </Text>
              <Text style={[typography.body, { color: colors.textMuted }]}>
                You are under 16, so a parent or guardian has to agree before you can
                publish anything, comment or follow people. Give us their email address
                and we will send them one message with a link.
              </Text>
              <Text style={[typography.body, { color: colors.textMuted }]}>
                You can look around Showcase while you wait.
              </Text>
            </View>

            <ErrorNote message={error} />

            <View style={{ gap: 6 }}>
              <Eyebrow>Parent or guardian's email</Eyebrow>
              <TextInput
                value={parentEmail}
                onChangeText={setParentEmail}
                placeholder="them@example.com"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: colors.text,
                  fontSize: 16,
                }}
              />
            </View>

            <Pressable
              onPress={() => setParentConfirmed((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: parentConfirmed }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: parentConfirmed ? colors.primary : colors.border,
                  backgroundColor: parentConfirmed ? colors.primary : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {parentConfirmed ? <Feather name="check" size={16} color={colors.bg} /> : null}
              </View>
              <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                This is a parent or guardian's address, not my own.
              </Text>
            </Pressable>

            <Button label="Send it" onPress={submitParent} loading={busy} />
            <Button label="Look around first" variant="ghost" onPress={onDone} />
          </>
        ) : null}

        {step === 'sent' ? (
          <>
            <View style={{ gap: 8 }}>
              <Eyebrow>Sent</Eyebrow>
              <Text style={[typography.h2, { color: colors.text }]}>
                We have emailed them
              </Text>
              <Text style={[typography.body, { color: colors.textMuted }]}>
                Once they confirm on the page the link opens, you can publish, comment
                and follow. Until then you can look around. The link works for 14 days.
              </Text>
              <Text style={[typography.small, { color: colors.textFaint }]}>
                Sent to {parentEmail.trim()}. If it does not arrive, check the spam
                folder before trying again.
              </Text>
            </View>
            <Button label="Have a look around" onPress={onDone} />
          </>
        ) : null}

        {user?.email ? (
          <Text style={[typography.small, { color: colors.textFaint, textAlign: 'center' }]}>
            Signed in as {user.email}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
