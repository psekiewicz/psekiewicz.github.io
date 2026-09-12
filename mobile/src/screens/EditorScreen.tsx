import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentHeader, HeaderButton, SectionRule, TonePill } from '../components/bloom';
import { Icon } from '../components/icons';
import {
  Button,
  Chip,
  ErrorNote,
  Eyebrow,
  Field,
  Heading,
  Body,
  Loading,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { displayNameOf } from '../data/auth';
import {
  createProject,
  deleteProject,
  getProjectById,
  updateProject,
} from '../data/projects';
import { parseTags, PROJECT_TYPE_OPTIONS } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space, typography } from '../theme/tokens';

// Create and edit are the same form, and there is now exactly one of it. It
// used to be reachable two ways that looked different - as the `Add` tab, with
// no header and the floating tab bar sitting over its buttons, and as a pushed
// stack screen with a real header - and the tab was the worse of the two: it
// stayed mounted between visits so it needed code to blank itself, and it was
// the one whose publish button kept ending up underneath the tab bar. The add
// button now pushes this screen like everything else does, so the tab is gone
// and so is the branching that served it.
//
// The form itself is no longer eight identical boxes in a column. What an entry
// actually needs is a title and something to show; everything else is optional
// and most of it is a URL somebody will paste once. So the required part comes
// first, the rest is grouped behind rules, and the three fields almost nobody
// fills are folded away until asked for. Publish and Save draft sit in a bar
// pinned to the bottom, above the system inset, which is both where the primary
// action belongs and the reason it can no longer be scrolled out of reach.
export function EditorScreen({ route, navigation }: any) {
  const projectId = route.params?.projectId;
  // Present when Android's share sheet opened this screen; see
  // plugins/withShareIntent.js and the linking config in RootNavigator.
  const sharedMediaUrl = route.params?.mediaUrl;
  const sharedTitle = route.params?.title;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [scrollImageUrl, setScrollImageUrl] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [tags, setTags] = useState('');
  const [projectType, setProjectType] = useState('other');
  const [published, setPublished] = useState(false);
  // Scrolls image, live URL and repository URL. Open automatically when editing
  // an entry that already has one, so nothing is ever hidden from its owner.
  const [showMore, setShowMore] = useState(false);

  const [loading, setLoading] = useState(!!projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getProjectById(projectId)
      .then((p) => {
        if (!p) {
          setError('That entry no longer exists.');
          return;
        }
        setTitle(p.title);
        setSummary(p.summary);
        setDescription(p.description);
        setImageUrl(p.imageUrl);
        setMediaUrl(p.mediaUrl);
        setScrollImageUrl(p.scrollImageUrl);
        setRepoUrl(p.repoUrl);
        setLiveUrl(p.liveUrl);
        setTags(p.tags.join(', '));
        setProjectType(p.type);
        setPublished(p.published);
        if (p.scrollImageUrl || p.repoUrl || p.liveUrl) setShowMore(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  // A share arriving from another app. No reset to fight with any more - this
  // screen is pushed, so it mounts empty every time.
  useEffect(() => {
    if (projectId) return;
    if (sharedMediaUrl) setMediaUrl(sharedMediaUrl);
    if (sharedTitle) setTitle(sharedTitle);
  }, [projectId, sharedMediaUrl, sharedTitle]);

  const pasteInto = async (setter: (value: string) => void) => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    // Saying nothing when the clipboard is empty is worse than saying so: the
    // button would look broken rather than idle.
    if (!text) return setError('Nothing in the clipboard to paste.');
    setError('');
    setter(text);
  };

  const save = async (publish: boolean) => {
    if (!user) return navigation.navigate('Login');
    if (!title.trim()) return setError('Give it a title.');

    setError('');
    setBusy(true);
    const fields = {
      title: title.trim(),
      summary: summary.trim(),
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      mediaUrl: mediaUrl.trim(),
      scrollImageUrl: scrollImageUrl.trim(),
      repoUrl: repoUrl.trim(),
      liveUrl: liveUrl.trim(),
      tags: parseTags(tags),
      type: projectType,
      published: publish,
    };

    try {
      if (projectId) {
        await updateProject(projectId, fields);
      } else {
        const name = profile?.displayName || displayNameOf(user);
        await createProject(user.id, name, fields);
      }
      navigation.navigate('Tabs', { screen: 'Dashboard' });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete this entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProject(projectId);
            navigation.navigate('Tabs', { screen: 'Dashboard' });
          } catch (e: any) {
            setError(e.message);
          }
        },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, justifyContent: 'center', gap: space.lg }}>
        <Heading>Sign in to publish</Heading>
        <Body muted>You need an account to add an entry.</Body>
        <Button label="Sign in" onPress={() => navigation.navigate('Login')} />
      </View>
    );
  }

  const header = (
    <AccentHeader
      eyebrow={projectId ? 'Edit entry' : 'New entry'}
      title={projectId ? title || 'Untitled' : 'Add something'}
      actions={
        <HeaderButton
          icon="back"
          label="Go back"
          // Android's share sheet can make this the first screen in the stack,
          // and there is nothing behind it to go back to.
          onPress={() =>
            navigation.canGoBack()
              ? navigation.goBack()
              : navigation.navigate('Tabs', { screen: 'Home' })
          }
        />
      }
    />
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {header}
        <Loading />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}

      <ScrollView
        contentContainerStyle={{ padding: gutter, paddingBottom: space.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <ErrorNote message={error} />

        <View style={{ gap: space.lg }}>
          <SectionRule label="THE BASICS" />

          <View>
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="What is it called?"
              autoCapitalize="sentences"
            />
            <Field
              label="Summary"
              value={summary}
              onChangeText={setSummary}
              placeholder="One line people see on the card"
              autoCapitalize="sentences"
            />

            <View style={{ gap: space.sm }}>
              <Eyebrow>Type</Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {PROJECT_TYPE_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    active={projectType === option.value}
                    onPress={() => setProjectType(option.value)}
                  />
                ))}
              </View>
            </View>
          </View>

          <SectionRule label="WHAT TO SHOW" />

          <View>
            <Field
              label="Media URL"
              value={mediaUrl}
              onChangeText={setMediaUrl}
              placeholder="https://…"
              hint="A direct .mp4/.mp3/.jpg plays in the app, and so do YouTube, Vimeo, Spotify and SoundCloud links."
            />
            {/* The other half of not having to type a URL on a phone: sharing
                to the app covers apps with a share sheet, this covers
                everything you have merely copied. */}
            <Button
              label="Paste from clipboard"
              icon="clipboard"
              variant="ghost"
              small
              onPress={() => pasteInto(setMediaUrl)}
              style={{ alignSelf: 'flex-start', marginTop: -space.sm, marginBottom: space.md }}
            />
            <Field
              label="Cover image URL"
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://…"
              hint="Shown on cards and at the top of the entry."
            />
            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="The longer story"
              multiline
              autoCapitalize="sentences"
            />
          </View>

          <SectionRule label="TAGS" />

          <Field
            value={tags}
            onChangeText={setTags}
            placeholder="comma, separated, tags"
            hint="Up to 10."
          />

          {/* Three fields most entries never use. Folded rather than dropped:
              an entry that has them still opens with them showing. */}
          <Pressable
            onPress={() => setShowMore((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMore }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingVertical: space.md,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={[typography.label, { color: colors.accent }]}>MORE DETAILS</Text>
            <View style={{ flex: 1, height: 1.5, borderRadius: radius.pill, backgroundColor: colors.border }} />
            <View style={{ transform: [{ rotate: showMore ? '180deg' : '0deg' }] }}>
              <Icon name="chevron-down" size={16} color={colors.accent} />
            </View>
          </Pressable>

          {showMore ? (
            <View>
              <Field
                label="Scrolls image URL"
                value={scrollImageUrl}
                onChangeText={setScrollImageUrl}
                placeholder="https://… (optional)"
                hint="A tall image for the full-screen feed. Falls back to the cover."
              />
              <Field
                label="Live URL"
                value={liveUrl}
                onChangeText={setLiveUrl}
                placeholder="https://…"
              />
              <Field
                label="Repository URL"
                value={repoUrl}
                onChangeText={setRepoUrl}
                placeholder="https://…"
              />
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <TonePill label={published ? 'PUBLISHED' : 'DRAFT'} tone={published ? 'accent' : 'neutral'} />
            <Text style={[typography.small, { color: colors.textFaint, flex: 1 }]}>
              Drafts are visible only to you - enforced by the database, not just hidden here.
            </Text>
          </View>

          {/* Away from Publish on purpose. */}
          {projectId ? (
            <Button label="Delete entry" variant="danger" icon="trash-2" onPress={confirmDelete} />
          ) : null}
        </View>
      </ScrollView>

      {/* The primary action, pinned. Sitting in the scroll it could be pushed
          off the bottom by the form above it, which is exactly what used to
          happen; and the inset keeps it clear of the system's own area. */}
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: gutter,
          paddingTop: space.md,
          paddingBottom: space.md + insets.bottom,
          backgroundColor: colors.surface,
          borderTopWidth: 1.5,
          borderTopColor: colors.border,
        }}
      >
        <Button
          label="Save as draft"
          variant="secondary"
          onPress={() => save(false)}
          disabled={busy}
          style={{ flex: 1 }}
        />
        <Button
          label={published ? 'Save changes' : 'Publish'}
          icon="check"
          onPress={() => save(true)}
          loading={busy}
          style={{ flex: 1 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
