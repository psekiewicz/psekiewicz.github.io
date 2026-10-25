import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../components/Text';
import { Avatar, Button, DisplayName, ErrorNote, Eyebrow, Field, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getFollowers, getFollowing, MiniProfile } from '../data/follows';
import {
  addNewsletterEditor,
  getNewsletter,
  getNewsletterEditorIds,
  isNewsEditor,
  Newsletter,
  removeNewsletterEditor,
} from '../data/news';
import { getProfilesByIds, Profile } from '../data/profiles';
import { column } from '../lib/layout';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, space, typography } from '../theme/tokens';

// Who writes in a newsletter: its owner and the editors the owner picked. The
// owner adds people they follow or who follow them, and removes anyone; an
// editor can step down. The native side of the site's newsletter editors panel.
export function NewsletterEditorsScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const newsletterId: string = route.params?.newsletterId;

  const [letter, setLetter] = useState<Newsletter | null>(null);
  const [editors, setEditors] = useState<Profile[]>([]);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [people, setPeople] = useState<MiniProfile[]>([]);
  const [manages, setManages] = useState(false);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [l, ids, newsroom] = await Promise.all([
        getNewsletter(newsletterId),
        getNewsletterEditorIds(newsletterId),
        user ? isNewsEditor() : Promise.resolve(false),
      ]);
      const profiles = await getProfilesByIds([...ids, l?.createdBy || '']);
      const runs = Boolean(user && (l?.createdBy === user.id || newsroom));
      setLetter(l);
      setOwner(l?.createdBy ? profiles.get(l.createdBy) || null : null);
      setEditors(ids.map((id) => profiles.get(id)).filter(Boolean) as Profile[]);
      setManages(runs);
      if (runs && user) {
        // The people to pick from: everyone this person follows or is followed by.
        const [followers, following] = await Promise.all([getFollowers(user.id), getFollowing(user.id)]);
        const byId = new Map<string, MiniProfile>();
        [...following, ...followers].forEach((p) => byId.set(p.id, p));
        setPeople([...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      }
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [newsletterId, user?.id]);

  useEffect(() => {
    navigation.setOptions({ title: 'Editors' });
    load();
  }, [navigation, load]);

  const candidates = useMemo(() => {
    const taken = new Set([...editors.map((e) => e.id), letter?.createdBy]);
    const q = filter.trim().toLowerCase();
    return people.filter((p) => !taken.has(p.id) && (!q || p.displayName.toLowerCase().includes(q)));
  }, [people, editors, letter, filter]);

  const add = async (person: MiniProfile) => {
    if (!user) return;
    setBusyId(person.id);
    try {
      await addNewsletterEditor(newsletterId, user.id, person.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const remove = (person: Profile) => {
    const self = person.id === user?.id;
    Alert.alert(self ? 'Step down as an editor?' : `Remove ${person.displayName}?`, self ? "You won't be able to write in it any more." : 'They can no longer write in it. Their articles stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: self ? 'Step down' : 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeNewsletterEditor(newsletterId, person.id);
            if (self) navigation.goBack();
            else load();
          } catch (e: any) {
            setError(e.message);
          }
        },
      },
    ]);
  };

  if (loading) return <Loading />;

  const row = (p: MiniProfile, right: React.ReactNode) => (
    <View key={p.id} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable
        onPress={() => navigation.push('UserProfile', { userId: p.id })}
        accessibilityRole="button"
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}
      >
        <Avatar url={p.avatarUrl} name={p.displayName} size={36} ring={p.equippedBorder} />
        <View style={{ flex: 1 }}>
          <DisplayName name={p.displayName} effect={p.equippedNameEffect} />
        </View>
      </Pressable>
      {right}
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ ...column(), padding: gutter, paddingBottom: space.xxl, gap: space.sm }}
      keyboardShouldPersistTaps="handled"
    >
      <ErrorNote message={error} />
      <Text style={[typography.small, { color: colors.textMuted, marginBottom: space.sm }]}>
        {letter?.title}: whoever is here can write in it. The owner can also edit anything in it and pick who's here.
      </Text>

      {owner ? row(owner, <Text style={{ color: colors.textFaint, fontSize: 12, fontWeight: '700' }}>OWNER</Text>) : null}
      {editors.map((p) =>
        row(
          p,
          manages || p.id === user?.id ? (
            <Button label={p.id === user?.id ? 'Step down' : 'Remove'} small variant="secondary" onPress={() => remove(p)} />
          ) : null
        )
      )}

      {manages ? (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <Eyebrow>Add an editor</Eyebrow>
          <Text style={[typography.small, { color: colors.textMuted }]}>From the people you follow and the people who follow you.</Text>
          <Field label="" value={filter} onChangeText={setFilter} placeholder="Search by name" />
          {candidates.length === 0 ? (
            <Text style={[typography.small, { color: colors.textFaint }]}>
              {people.length ? 'Nobody else matches.' : 'Follow someone, or get a follower, to add them here.'}
            </Text>
          ) : (
            candidates.map((p) => row(p, <Button label="Add" icon="plus" small loading={busyId === p.id} onPress={() => add(p)} />))
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
