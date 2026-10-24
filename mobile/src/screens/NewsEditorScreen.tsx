import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { FormatEditor } from '../components/FormatEditor';
import { Text } from '../components/Text';
import { Button, ErrorNote, Eyebrow, Field, Loading } from '../components/ui';
import { UploadButton } from '../components/UploadButton';
import { useAuth } from '../context/AuthContext';
import {
  createArticle,
  createIssue,
  deleteArticle,
  getArticle,
  getIssue,
  updateArticle,
  updateIssue,
} from '../data/news';
import { column } from '../lib/layout';
import { withScheme } from '../lib/media';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, space, typography } from '../theme/tokens';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// What a news editor writes with: an issue (mode 'issue') or an article in
// one (mode 'article'), new or - given its id - edited. RLS is what stops
// anyone else; this screen is only reachable from controls editors see. The
// native side of js/news-editor.js.
export function NewsEditorScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { mode, issueId, articleId, position = 0 } = route.params || {};
  const isIssue = mode === 'issue';
  const editingId: string | undefined = isIssue ? issueId : articleId;

  const [loading, setLoading] = useState(Boolean(editingId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Issue fields.
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [published, setPublished] = useState(true);
  // Article fields (title shared).
  const [lead, setLead] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [order, setOrder] = useState(String(position));

  useEffect(() => {
    navigation.setOptions({ title: `${editingId ? 'Edit' : 'New'} ${isIssue ? 'issue' : 'article'}` });
    if (!editingId) return;
    (async () => {
      try {
        if (isIssue) {
          const i = await getIssue(editingId);
          if (i) {
            setTitle(i.title);
            setSummary(i.summary);
            setCoverUrl(i.coverUrl);
            setPeriodStart(i.periodStart || '');
            setPeriodEnd(i.periodEnd || '');
            setPublished(i.published);
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
            setOrder(String(a.position));
          }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [editingId, isIssue, navigation]);

  const save = async () => {
    if (!user) return navigation.navigate('Login');
    if (title.trim().length < 3) return setError(`Give the ${isIssue ? 'issue a title' : 'article a headline'} (at least 3 characters).`);
    setError('');
    setBusy(true);
    try {
      if (isIssue) {
        for (const d of [periodStart, periodEnd]) {
          if (d && !DATE.test(d)) throw new Error('Dates are written YYYY-MM-DD, e.g. 2026-10-24.');
        }
        if (periodStart && periodEnd && periodEnd < periodStart) throw new Error('The week has to end after it starts.');
        const fields = {
          title,
          summary,
          coverUrl: withScheme(coverUrl),
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          published,
        };
        if (editingId) {
          await updateIssue(editingId, fields);
          navigation.goBack();
        } else {
          const created = await createIssue(user.id, fields);
          navigation.replace('Issue', { issueId: created.id });
        }
      } else {
        const fields = {
          title,
          lead,
          body,
          imageUrl: withScheme(imageUrl),
          sourceName,
          sourceUrl: withScheme(sourceUrl),
          position: Number.parseInt(order, 10) || 0,
        };
        if (editingId) await updateArticle(editingId, fields);
        else await createArticle(issueId, user.id, fields);
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
        <Field label={isIssue ? 'Title' : 'Headline'} value={title} onChangeText={setTitle} autoCapitalize="sentences" placeholder={isIssue ? 'XOXD T&G Weekly - 24-31 Oct 2026' : ''} />
        {isIssue ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Week from" value={periodStart} onChangeText={setPeriodStart} placeholder="2026-10-24" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="to" value={periodEnd} onChangeText={setPeriodEnd} placeholder="2026-10-31" />
              </View>
            </View>
            <Field label="Summary" value={summary} onChangeText={setSummary} autoCapitalize="sentences" placeholder="The week's biggest stories, in a sentence" />
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
            <Field label="Position in the issue" value={order} onChangeText={setOrder} keyboardType="number-pad" hint="Lower comes first." />
          </>
        )}
        <Button label={editingId ? 'Save changes' : isIssue ? 'Create issue' : 'Add article'} icon="check" onPress={save} loading={busy} />
        {!isIssue && editingId ? (
          <Button label="Delete article" icon="trash-2" variant="danger" onPress={confirmDelete} style={{ marginTop: space.md }} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
