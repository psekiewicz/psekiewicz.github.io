import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * The screen of last resort.
 *
 * Deliberately imports nothing but React and react-native — no theme, no
 * design system, no icons. It has to render in a process where something has
 * already gone badly wrong, so anything it depended on could be the very thing
 * that is broken. Colours are literals for the same reason.
 */
export function FatalError({ error, where }: { error: unknown; where: string }) {
  const err = error as { message?: string; stack?: string } | null;
  const message = (err && err.message) || String(error);
  const stack = (err && err.stack) || '';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Showcase couldn't start</Text>
        <Text style={styles.lead}>
          Something failed while the app was loading. The details below are what went wrong —
          sending them on is what makes this fixable.
        </Text>

        <Text style={styles.label}>WHERE</Text>
        <Text style={styles.mono}>{where}</Text>

        <Text style={styles.label}>ERROR</Text>
        <Text style={styles.mono}>{message}</Text>

        {stack ? (
          <>
            <Text style={styles.label}>STACK</Text>
            <Text style={styles.stack}>{stack}</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14120f' },
  body: { padding: 24, paddingTop: 72, gap: 8 },
  title: { color: '#f2efe9', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  lead: { color: '#a8a29a', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  label: {
    color: '#c1543a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
  },
  mono: { color: '#f2efe9', fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  stack: { color: '#a8a29a', fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
});
