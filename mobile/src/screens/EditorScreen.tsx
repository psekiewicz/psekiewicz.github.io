import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentHeader, HeaderButton } from '../components/bloom';
import { Icon, IconName } from '../components/icons';
import { Body, Button, Chip, ErrorNote, Heading, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { displayNameOf } from '../data/auth';
import {
  createProject,
  deleteProject,
  getProjectById,
  updateProject,
} from '../data/projects';
import { posterFor, resolveMedia } from '../lib/media';
import { normalizeTags, PROJECT_TYPE_OPTIONS } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { Colors, gutter, radius, space, typography } from '../theme/tokens';

// A composer, not a form.
//
// Both previous versions were the same thing underneath: a column of labelled
// boxes, one per database column. Grouping them under headings made it tidier
// without making it any less like filling in a record - you still faced eight
// identical outlined rectangles and had to read every label to find the two
// that matter.
//
// What you are actually doing is writing a post. So the text reads as text:
// the title is just large type on the page, the summary and the description
// are lines under it, no boxes and no labels, the way they will look once
// published. The media is a slot that shows you what you pasted - a thumbnail
// and "YouTube video", not a URL in a field. Tags are tags, added one at a
// time and removed with a tap, rather than a string you punctuate correctly.
// And the four URLs almost nobody sets are one tap away instead of four empty
// boxes taking up the screen.
//
// Two fields, title and media, carry almost every entry. They are the two at
// the top and the two that look like anything.

/** The unboxed text inputs - title, summary, description. */
function PlainInput({
  value,
  onChangeText,
  placeholder,
  colors,
  size = 'body',
  multiline,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  colors: Colors;
  size?: 'title' | 'lead' | 'body';
  multiline?: boolean;
}) {
  const type = {
    title: { fontSize: 25, fontWeight: '700' as const, letterSpacing: -0.9, lineHeight: 31 },
    lead: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
    body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 22 },
  }[size];

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      multiline={multiline}
      autoCapitalize="sentences"
      autoCorrect
      // No border, no fill, no label. Padding only where it keeps the caret
      // off the gutter.
      style={{
        ...type,
        color: size === 'body' ? colors.textMuted : colors.text,
        paddingVertical: 6,
        minHeight: multiline ? 92 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

/** What the pasted URL turned out to be, in words and an icon. */
function describe(url: string): { label: string; icon: IconName } | null {
  const media = resolveMedia(url);
  if (!media) return null;
  switch (media.kind) {
    case 'video':
      return { label: 'Video file', icon: 'play' };
    case 'audio':
      return { label: 'Audio file', icon: 'music' };
    case 'image':
      return { label: 'Image', icon: 'image' };
    case 'provider': {
      const name = media.provider[0].toUpperCase() + media.provider.slice(1);
      return { label: `${name} · plays in the app`, icon: 'play' };
    }
    default:
      return { label: 'Link', icon: 'external' };
  }
}

/**
 * The media slot. Empty it invites a paste; filled it shows what it resolved
 * to, which is the part a URL in a text field never tells you - whether the
 * link you pasted is one the app can actually play.
 */
function MediaSlot({
  url,
  onChange,
  onPaste,
  colors,
}: {
  url: string;
  onChange: (v: string) => void;
  onPaste: () => void;
  colors: Colors;
}) {
  const [editing, setEditing] = useState(false);
  const poster = url ? posterFor(url) : null;
  const kind = url ? describe(url) : null;

  if (!url || editing) {
    return (
      <View
        style={{
          borderWidth: 1.5,
          borderColor: colors.borderStrong,
          borderStyle: 'dashed',
          borderRadius: radius.md,
          padding: space.lg,
          gap: space.md,
          backgroundColor: colors.surface,
        }}
      >
        <TextInput
          value={url}
          onChangeText={onChange}
          onBlur={() => setEditing(false)}
          autoFocus={editing}
          placeholder="Paste a link - YouTube, Spotify, an mp4, an image…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ fontSize: 13, color: colors.text, paddingVertical: 2 }}
        />
        <Button
          label="Paste from clipboard"
          icon="clipboard"
          variant="ghost"
          small
          onPress={onPaste}
          style={{ alignSelf: 'flex-start' }}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setEditing(true)}
      accessibilityRole="button"
      accessibilityLabel="Change the media link"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.sm,
        paddingRight: space.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.border,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 68,
          height: 52,
          borderRadius: radius.sm,
          overflow: 'hidden',
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {poster ? (
          <Image source={{ uri: poster }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Icon name={kind?.icon || 'external'} size={20} color={colors.primaryDeep} />
        )}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
          {kind?.label || 'Link'}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
          {url}
        </Text>
      </View>

      <Pressable
        onPress={() => onChange('')}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Remove the media"
      >
        <Text style={{ fontSize: 18, color: colors.textFaint, paddingHorizontal: 4 }}>×</Text>
      </Pressable>
    </Pressable>
  );
}

/** Tags as tags. */
function TagField({
  tags,
  onChange,
  colors,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  colors: Colors;
}) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    // Splitting on the comma means pasting "a, b, c" still works, without the
    // comma being something you have to remember to type.
    if (!raw.trim()) return;
    const next = normalizeTags([...tags, ...raw.split(',')]);
    onChange(next);
    setDraft('');
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
      {tags.map((tag) => (
        <Pressable
          key={tag}
          onPress={() => onChange(tags.filter((t) => t !== tag))}
          accessibilityRole="button"
          accessibilityLabel={`Remove the tag ${tag}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.accentSoft,
            borderRadius: radius.pill,
            paddingLeft: 12,
            paddingRight: 9,
            paddingVertical: 7,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accentDeep }}>{tag}</Text>
          <Text style={{ fontSize: 13, color: colors.accentDeep, opacity: 0.7 }}>×</Text>
        </Pressable>
      ))}

      {tags.length < 10 ? (
        <TextInput
          value={draft}
          onChangeText={(v) => (v.endsWith(',') ? commit(v) : setDraft(v))}
          onSubmitEditing={() => commit(draft)}
          onBlur={() => commit(draft)}
          blurOnSubmit={false}
          returnKeyType="done"
          placeholder={tags.length ? 'Add another' : 'Add a tag'}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ minWidth: 110, fontSize: 12, color: colors.text, paddingVertical: 7 }}
        />
      ) : null}
    </View>
  );
}

/** One optional URL, as a row rather than a labelled box. */
function LinkRow({
  icon,
  label,
  value,
  onChangeText,
  colors,
}: {
  icon: IconName;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colors: Colors;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.sm,
        borderBottomWidth: 1.5,
        borderBottomColor: colors.border,
      }}
    >
      <Icon name={icon} size={17} color={colors.textFaint} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, width: 96 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="https://…"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={{ flex: 1, fontSize: 12, color: colors.text, paddingVertical: 6 }}
      />
    </View>
  );
}

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
  const [tags, setTags] = useState<string[]>([]);
  const [projectType, setProjectType] = useState('other');
  const [published, setPublished] = useState(false);
  // Cover, scrolls image, live URL and repository URL. Opens automatically
  // when editing an entry that already has one, so nothing is hidden from its
  // owner.
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
        setTags(p.tags);
        setProjectType(p.type);
        setPublished(p.published);
        if (p.imageUrl || p.scrollImageUrl || p.repoUrl || p.liveUrl) setShowMore(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  // A share arriving from another app. No reset to fight with - this screen is
  // pushed, so it mounts empty every time.
  useEffect(() => {
    if (projectId) return;
    if (sharedMediaUrl) setMediaUrl(sharedMediaUrl);
    if (sharedTitle) setTitle(sharedTitle);
  }, [projectId, sharedMediaUrl, sharedTitle]);

  const pasteMedia = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    // Saying nothing when the clipboard is empty is worse than saying so: the
    // button would look broken rather than idle.
    if (!text) return setError('Nothing in the clipboard to paste.');
    setError('');
    setMediaUrl(text);
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
      tags: normalizeTags(tags),
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

  const header = (
    <AccentHeader
      eyebrow={projectId ? (published ? 'Editing · published' : 'Editing · draft') : 'New entry'}
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

  // Signed out, this screen still gets the header: the stack's own header is
  // off here, so without it the only way out was Android's back gesture.
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {header}
        <View style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.lg }}>
          <Heading>Sign in to publish</Heading>
          <Body muted>You need an account to add an entry.</Body>
          <Button label="Sign in" onPress={() => navigation.navigate('Login')} />
          <Button
            label="Create account"
            variant="secondary"
            onPress={() => navigation.navigate('Register')}
          />
        </View>
      </View>
    );
  }

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
        contentContainerStyle={{ padding: gutter, paddingBottom: space.xl, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <ErrorNote message={error} />

        {/* The entry, written the way it will read. */}
        <View>
          <PlainInput
            value={title}
            onChangeText={setTitle}
            placeholder="Untitled"
            colors={colors}
            size="title"
          />
          <PlainInput
            value={summary}
            onChangeText={setSummary}
            placeholder="One line for the card"
            colors={colors}
            size="lead"
          />
        </View>

        <MediaSlot url={mediaUrl} onChange={setMediaUrl} onPaste={pasteMedia} colors={colors} />

        <PlainInput
          value={description}
          onChangeText={setDescription}
          placeholder="Write something about it…"
          colors={colors}
          multiline
        />

        <View style={{ height: 1.5, backgroundColor: colors.border, borderRadius: radius.pill }} />

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

        <TagField tags={tags} onChange={setTags} colors={colors} />

        {/* Four URLs most entries never set. One tap, rather than four empty
            boxes holding the screen open. */}
        <Pressable
          onPress={() => setShowMore((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showMore }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingVertical: space.sm,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="plus" size={15} color={colors.accent} />
          <Text style={[typography.label, { color: colors.accent }]}>
            {showMore ? 'FEWER OPTIONS' : 'COVER IMAGE AND LINKS'}
          </Text>
        </Pressable>

        {showMore ? (
          <View>
            <LinkRow
              icon="image"
              label="Cover"
              value={imageUrl}
              onChangeText={setImageUrl}
              colors={colors}
            />
            <LinkRow
              icon="scrolls"
              label="Scrolls"
              value={scrollImageUrl}
              onChangeText={setScrollImageUrl}
              colors={colors}
            />
            <LinkRow
              icon="external"
              label="Live"
              value={liveUrl}
              onChangeText={setLiveUrl}
              colors={colors}
            />
            <LinkRow
              icon="chart"
              label="Repository"
              value={repoUrl}
              onChangeText={setRepoUrl}
              colors={colors}
            />
          </View>
        ) : null}

        {projectId ? (
          <Button
            label="Delete entry"
            variant="danger"
            icon="trash-2"
            onPress={confirmDelete}
            style={{ marginTop: space.md }}
          />
        ) : null}
      </ScrollView>

      {/* The primary action, pinned. In the scroll it could be pushed off the
          bottom by the form above it, which is exactly what used to happen;
          and the inset keeps it clear of the system's own area. */}
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
          label="Draft"
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
          style={{ flex: 1.4 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
