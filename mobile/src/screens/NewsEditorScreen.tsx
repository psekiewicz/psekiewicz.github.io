import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { FormatEditor } from '../components/FormatEditor';
import { Text } from '../components/Text';
import { Button, ErrorNote, Eyebrow, Field, Loading } from '../components/ui';
import { UploadButton } from '../components/UploadButton';
import { useAuth } from '../context/AuthContext';
import {
  createArticle,
  createNewsletter,
  deleteArticle,
  getArticle,
  getNewsletter,
  updateArticle,
  updateNewsletter,
} from '../data/news';
import { column } from '../lib/layout';
import { withScheme } from '../lib/media';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, space, typography } from '../theme/tokens';

// What a news editor writes with: a newsletter (mode 'newsletter') or an
// article in one (mode 'article'), new or - given its id - edited. RLS is what stops
// anyone else; this screen is only reachable from controls editors see. The
// native side of js/news-editor.js.
export function NewsEditorScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { mode, newsletterId, articleId } = route.params || {};
  const isLetter = mode === 'newsletter';
  const editingId: string | undefined = isLetter ? newsletterId : articleId;

  const [loading, setLoading] = useState(Boolean(editingId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Newsletter fields.
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [published, setPublished] = useState(true);
  // Article fields (title shared).
  const [lead, setLead] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: `${editingId ? 'Edit' : 'New'} ${isLetter ? 'newsletter' : 'article'}` });
    if (!editingId) return;
    (async () => {
      try {
        if (isLetter) {
          const l = await getNewsletter(editingId);
          if (l) {
            setTitle(l.title);
            setSummary(l.summary);
            setCoverUrl(l.coverUrl);
            setPublished(l.published);
          }
        } else {
          const a = await getArticle(editingId);
          if (a) {
            setTitle(a.title);
            setLead(a.lead);
            setBody(a.body);
            setImageUrl(a.imageUrl);
            setSourceName(a.sourceName);
            setSourceUrl(a.sourceUrl);
          }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [editingId, isLetter, navigation]);

  const save = async () => {
    if (!user) return navigation.navigate('Login');
    if (title.trim().length < 3) return setError(`Give the ${isLetter ? 'newsletter a name' : 'article a headline'} (at least 3 characters).`);
    setError('');
    setBusy(true);
    try {
      if (isLetter) {
        const fields = { title, summary, coverUrl: withScheme(coverUrl), published };
        if (editingId) {
          await updateNewsletter(editingId, fields);
          navigation.goBack();
        } else {
          const created = await createNewsletter(user.id, fields);
          navigation.replace('Newsletter', { newsletterId: created.id });
        }
      } else {
        const fields = {
          title,
          lead,
          body,
          imageUrl: withScheme(imageUrl),
          sourceName,
          sourceUrl: withScheme(sourceUrl),
        };
        if (editingId) await updateArticle(editingId, fields);
        else await createArticle(newsletterId, user.id, fields);
        navigation.goBack();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete this article?', title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteArticle(editingId!);
            navigation.goBack();
          } catch (e: any) {
            setError(e.message);
          }
        },
      },
    ]);

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ ...column(), padding: gutter, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <ErrorNote message={error} />
        <Field label={isLetter ? 'Name' : 'Headline'} value={title} onChangeText={setTitle} autoCapitalize="sentences" placeholder={isLetter ? 'XOXD T&G Weekly' : ''} />
        {isLetter ? (
          <>
            <Field label="What it is" value={summary} onChangeText={setSummary} autoCapitalize="sentences" placeholder="Tech and gaming news of the week, every Saturday" />
            <Field label="Cover image" value={coverUrl} onChangeText={setCoverUrl} placeholder="https://…" />
            <UploadButton kind="cover" onUploaded={setCoverUrl} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.lg }}>
              <Switch value={published} onValueChange={setPublished} />
              <Text style={[typography.small, { color: colors.textMuted, flex: 1 }]}>
                {published ? 'Published - everyone can read it' : 'Draft - only news editors see it'}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Field label="Lead" value={lead} onChangeText={setLead} multiline autoCapitalize="sentences" placeholder="A sentence or two under the headline" />
            <Field label="Picture" value={imageUrl} onChangeText={setImageUrl} placeholder="https://…" />
            <UploadButton kind="cover" onUploaded={setImageUrl} />
            <View style={{ marginTop: space.lg, marginBottom: space.lg, gap: space.xs }}>
              <Eyebrow>Article</Eyebrow>
              <FormatEditor value={body} onChangeText={setBody} placeholder="The full story" colors={colors} />
            </View>
            <Field label="Source" value={sourceName} onChangeText={setSourceName} autoCapitalize="words" placeholder="The Verge" />
            <Field label="Source link" value={sourceUrl} onChangeText={setSourceUrl} placeholder="https://…" />
          </>
        )}
        <Button label={editingId ? 'Save changes' : isLetter ? 'Create newsletter' : 'Add article'} icon="check" onPress={save} loading={busy} />
        {!isLetter && editingId ? (
          <Button label="Delete article" icon="trash-2" variant="danger" onPress={confirmDelete} style={{ marginTop: space.md }} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
