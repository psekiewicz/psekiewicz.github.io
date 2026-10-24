import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';

import { Text } from '../../components/Text';
import { Body, Button, Card, ErrorNote, Eyebrow, SuccessNote } from '../../components/ui';
import { column } from '../../lib/layout';
import { openLink } from '../../lib/links';
import { useTheme } from '../../theme/ThemeProvider';
import { gutter, space, typography } from '../../theme/tokens';
import { ApkRelease, applyOta, checkOta, installedVersion, isNewerApk, latestApk, otaAvailable } from './checks';

// "App updates": what's installed, and the two kinds of update there can be
// (see checks.ts) - a quick over-the-air one that only needs a restart, and a
// new APK that the phone installs from the browser. Reached from Settings.
export function UpdateScreen({ navigation }: any) {
  const { colors } = useTheme();
  const installed = installedVersion();

  const [checking, setChecking] = useState(true);
  const [otaReady, setOtaReady] = useState(false);
  const [otaError, setOtaError] = useState('');
  const [applying, setApplying] = useState(false);
  const [apk, setApk] = useState<ApkRelease | null>(null);
  const [apkError, setApkError] = useState('');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    const [ota, release] = await Promise.all([
      checkOta().then(
        (v) => (setOtaError(''), v),
        (e) => (setOtaError(e.message), false)
      ),
      latestApk().then(
        (v) => (setApkError(''), v),
        (e) => (setApkError(e.message), null)
      ),
    ]);
    setOtaReady(ota);
    setApk(release);
    setCheckedAt(new Date());
    setChecking(false);
  }, []);

  useEffect(() => {
    navigation.setOptions({ title: 'App updates' });
    check();
  }, [navigation, check]);

  const restartIntoUpdate = async () => {
    setApplying(true);
    try {
      await applyOta();
    } catch (e: any) {
      setApplying(false);
      Alert.alert('Could not install the update', e.message);
    }
  };

  const newerApk = isNewerApk(apk, installed);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ ...column(), padding: gutter, paddingBottom: space.xxl, gap: space.lg }}
      refreshControl={
        <RefreshControl refreshing={checking} onRefresh={check} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />
      }
    >
      <View style={{ gap: space.xs }}>
        <Eyebrow>Installed</Eyebrow>
        <Body>
          XOXD {installed.version}
          {installed.build !== null ? ` (build ${installed.build})` : ''}
        </Body>
        <Text style={[typography.small, { color: colors.textFaint }]}>
          {installed.updatedAt
            ? `With the update from ${installed.updatedAt.toLocaleString()}`
            : 'As it came in the APK - no update applied yet'}
          {installed.channel ? ` · channel ${installed.channel}` : ''}
        </Text>
        {checkedAt ? (
          <Text style={[typography.small, { color: colors.textFaint }]}>Checked {checkedAt.toLocaleTimeString()} - pull down to check again</Text>
        ) : null}
      </View>

      <Card style={{ gap: space.sm }}>
        <Eyebrow>Quick update</Eyebrow>
        <Text style={[typography.small, { color: colors.textMuted }]}>
          New screens and fixes that don't need a new APK. The app fetches these by itself and uses them from the next start; here you can get one now.
        </Text>
        <ErrorNote message={otaError} />
        {!otaAvailable ? (
          <Body muted>Not available in a development build.</Body>
        ) : otaReady ? (
          <>
            <SuccessNote message="An update is ready." />
            <Button label="Update and restart" icon="refresh-cw" onPress={restartIntoUpdate} loading={applying} />
          </>
        ) : (
          <Body muted>{checking ? 'Checking…' : "You're up to date."}</Body>
        )}
      </Card>

      <Card style={{ gap: space.sm }}>
        <Eyebrow>New app version</Eyebrow>
        <Text style={[typography.small, { color: colors.textMuted }]}>
          Some changes need a new APK. Downloading it opens your browser; open the file when it's done and Android installs it over this one - your account and settings stay.
        </Text>
        <ErrorNote message={apkError} />
        {newerApk && apk ? (
          <>
            <SuccessNote message={`${apk.name} is out (published ${new Date(apk.publishedAt).toLocaleDateString()}).`} />
            <Button label="Download the new APK" icon="download" onPress={() => openLink(apk.downloadUrl)} />
          </>
        ) : (
          <Body muted>
            {checking ? 'Checking…' : apk ? 'You have the newest APK.' : apkError ? '' : 'No APK has been published yet.'}
          </Body>
        )}
      </Card>
    </ScrollView>
  );
}
