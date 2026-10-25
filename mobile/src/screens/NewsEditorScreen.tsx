import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { FormatEditor } from '../components/FormatEditor';
import { Text } from '../components/Text';
import { Button, ErrorNote, Eyebrow, Field, Loading } from '../components/ui';
import { UploadButton } from '../components/UploadButton';
import { useAuth } from '../context/AuthContext';
import {
  createArticle,
  deleteArticle,
  getArticle,
  getMyNewsletterTerms,
  getNewsletter,
  NewsletterTerms,
  startNewsletter,
  updateArticle,
  updateNewsletter,
} from '../data/news';
import { column } from '../lib/layout';
import { withScheme } from '../lib/media';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, space, typography } from '../theme/tokens';

// What news is written with: a newsletter (mode 'newsletter') or an article
// in one (mode 'article'), new or - given its id - edited. Anyone signed in
// can start a newsletter (it says what that costs them); articles and edits
// are for whoever writes in that newsletter. RLS is what stops anyone else.
// The native side of js/news-editor.js.
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
  // Starting a newsletter: what it costs this person.
  const [terms, setTerms] = useState<NewsletterTerms | null>(null);
  const starting = isLetter && !editingId;

  useEffect(() => {
    navigation.setOptions({ title: `${editingId ? 'Edit' : 'New'} ${isLetter ? 'newsletter' : 'article'}` });
    if (isLetter && !editingId) {
      getMyNewsletterTerms()
        .then(setTerms)
        .catch((e) => setError(e.message));
      return;
    }
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
          const id = await startNewsletter(fields);
          navigation.replace('Newsletter', { newsletterId: id });
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
                {published ? 'Published - everyone can read it' : 'Draft - only you and its editors see it'}
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
        {starting && terms ? <TermsNote terms={terms} /> : null}
        <Button
          label={editingId ? 'Save changes' : isLetter ? (terms?.cost ? `Start it · ${terms.cost} points` : 'Start newsletter') : 'Add article'}
          icon="check"
          onPress={save}
          loading={busy}
          disabled={starting && (!terms || !terms.canStart)}
        />
        {!isLetter && editingId ? (
          <Button label="Delete article" icon="trash-2" variant="danger" onPress={confirmDelete} style={{ marginTop: space.md }} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// What starting a newsletter takes, and where this person stands.
function TermsNote({ terms }: { terms: NewsletterTerms }) {
  const { colors } = useTheme();
  const atCap = !terms.canStart && terms.owned >= terms.maxOwned;
  const line = atCap
    ? `You already run ${terms.maxOwned} newsletters - the most anyone can.`
    : terms.cost === 0
      ? `Free for you - you're popular. You'll own it, and pick who else writes in it.`
      : `It costs ${terms.price} points - you have ${terms.points}. It's free once ${terms.popularFollowers} people follow you (${terms.followers} do now), and Completionist - every other achievement - pays ${terms.price} on its own.`;
  return (
    <View style={{ padding: space.md, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: space.lg, gap: space.xs }}>
      <Eyebrow>Your own newsletter</Eyebrow>
      <Text style={[typography.small, { color: colors.textMuted }]}>{line}</Text>
    </View>
  );
}
