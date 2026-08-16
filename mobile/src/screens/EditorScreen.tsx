import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import {
  Body,
  Button,
  Chip,
  ErrorNote,
  Eyebrow,
  Field,
  Heading,
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
import { space, typography } from '../theme/tokens';

// Create and edit are the same form — the web build splits them across
// dashboard.html's create sheet and its edit mode, but on a phone one screen
// that knows whether it has an id is simpler and behaves identically.
export function EditorScreen({ route, navigation }: any) {
  const projectId = route.params?.projectId;
  const { colors } = useTheme();
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

  const [loading, setLoading] = useState(!!projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) {
      // Coming back to the Add tab: reset rather than showing the last edit.
      setTitle('');
      setSummary('');
      setDescription('');
      setImageUrl('');
      setMediaUrl('');
      setScrollImageUrl('');
      setRepoUrl('');
      setLiveUrl('');
      setTags('');
      setProjectType('other');
      setPublished(false);
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
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId, route.params?.key]);

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

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <Eyebrow>{projectId ? 'Edit entry' : 'New entry'}</Eyebrow>
        <Heading style={{ marginTop: space.xs, marginBottom: space.lg }}>
          {projectId ? title || 'Untitled' : 'Add something'}
        </Heading>

        <ErrorNote message={error} />

        <Field label="Title" value={title} onChangeText={setTitle} placeholder="What is it called?" autoCapitalize="sentences" />
        <Field
          label="Summary"
          value={summary}
          onChangeText={setSummary}
          placeholder="One line people see on the card"
          autoCapitalize="sentences"
        />

        <View style={{ marginBottom: space.lg, gap: space.sm }}>
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

        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="The longer story"
          multiline
          autoCapitalize="sentences"
        />

        <Field
          label="Media URL"
          value={mediaUrl}
          onChangeText={setMediaUrl}
          placeholder="https://…"
          hint="A direct .mp4/.mp3/.jpg plays in the app. YouTube, Vimeo, Spotify and SoundCloud links open in their own app."
        />
        <Field
          label="Cover image URL"
          value={imageUrl}
          onChangeText={setImageUrl}
          placeholder="https://…"
          hint="Shown on cards and at the top of the entry."
        />
        <Field
          label="Scrolls image URL"
          value={scrollImageUrl}
          onChangeText={setScrollImageUrl}
          placeholder="https://… (optional)"
          hint="A tall image for the full-screen feed. Falls back to the cover."
        />
        <Field label="Live URL" value={liveUrl} onChangeText={setLiveUrl} placeholder="https://…" />
        <Field label="Repository URL" value={repoUrl} onChangeText={setRepoUrl} placeholder="https://…" />
        <Field
          label="Tags"
          value={tags}
          onChangeText={setTags}
          placeholder="comma, separated, tags"
          hint="Up to 10."
        />

        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Button
            label={published ? 'Save changes' : 'Publish'}
            icon="check"
            onPress={() => save(true)}
            loading={busy}
          />
          <Button
            label="Save as draft"
            variant="secondary"
            onPress={() => save(false)}
            disabled={busy}
          />
          {projectId ? (
            <Button label="Delete entry" variant="danger" icon="trash-2" onPress={confirmDelete} />
          ) : null}
        </View>

        <Text style={[typography.small, { color: colors.textFaint, marginTop: space.lg }]}>
          Drafts are visible only to you — enforced by the database, not just hidden here.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
