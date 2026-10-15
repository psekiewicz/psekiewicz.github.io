import React, { useState } from 'react';
import { View } from 'react-native';

import { formatBytes, pickAndUpload, UploadKind } from '../lib/upload';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './ui';

/**
 * Picks a file from the phone, compresses it, uploads it and hands back its
 * URL - which the caller writes into the same field a pasted link goes in.
 * Says how it is getting on underneath, and what it saved.
 */
export function UploadButton({
  kind,
  onUploaded,
  label = 'Upload from phone',
}: {
  kind: UploadKind;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);

  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await pickAndUpload(kind, (stage, progress) =>
        setStatus(
          stage === 'upload'
            ? 'Uploading…'
            : progress
              ? `Shrinking… ${Math.round(progress * 100)}%`
              : 'Shrinking…'
        )
      );
      if (!result) {
        setStatus('');
        return;
      }
      onUploaded(result.url);
      setStatus(
        result.size < result.originalSize
          ? `Uploaded - ${formatBytes(result.originalSize)} → ${formatBytes(result.size)}`
          : `Uploaded - ${formatBytes(result.size)}`
      );
    } catch (e: any) {
      setFailed(true);
      setStatus(e?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 4, alignItems: 'flex-start' }}>
      <Button label={label} icon="upload" variant="ghost" small loading={busy} onPress={start} />
      {status ? (
        <Text style={{ fontSize: 11, color: failed ? colors.danger : colors.textFaint }}>{status}</Text>
      ) : null}
    </View>
  );
}
