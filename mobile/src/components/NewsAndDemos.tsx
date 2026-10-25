import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { getArticlesFeaturing, Featuring, linkedDemoIds } from '../data/news';
import { getProfilesByIds, Profile } from '../data/profiles';
import { getDemosByIds, Project } from '../data/projects';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { PostTile } from './PostTile';
import { Text } from './Text';
import { ListGroup, ListRow } from './ui';

// Demos and the news pointing at each other (data/news.ts): an article shows
// the demos it links to as tiles, and a demo's page lists the articles that
// featured it. The native side of the same sections in article.html and
// project.html. Both draw nothing until there is something to show.

/** The demos an article's text links to, two to a row, under the text. */
export function ArticleDemos({ body, navigation }: { body: string; navigation: any }) {
  const { colors } = useTheme();
  const [demos, setDemos] = useState<Project[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());

  useEffect(() => {
    let live = true;
    const ids = linkedDemoIds(body);
    if (!ids.length) return;
    getDemosByIds(ids)
      .then(async (list) => {
        const people = await getProfilesByIds(list.map((d) => d.uid)).catch(() => new Map<string, Profile>());
        if (live) {
          setDemos(list);
          setAuthors(people);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [body]);

  if (!demos.length) return null;
  const rows: Project[][] = [];
  for (let i = 0; i < demos.length; i += 2) rows.push(demos.slice(i, i + 2));

  return (
    <View style={{ gap: space.sm, marginTop: space.lg }}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
        {demos.length === 1 ? 'The demo in this article' : 'Demos in this article'}
      </Text>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
          {row.map((d) => (
            <View key={d.id} style={{ flex: 1 }}>
              <PostTile project={d} author={authors.get(d.uid)} onPress={() => navigation.push('ProjectDetail', { projectId: d.id })} />
            </View>
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

/** "Featured in the news": the articles that linked to this demo. */
export function FeaturedInNews({ projectId, navigation }: { projectId: string; navigation: any }) {
  const [articles, setArticles] = useState<Featuring[]>([]);

  useEffect(() => {
    let live = true;
    getArticlesFeaturing(projectId)
      .then((list) => live && setArticles(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId]);

  if (!articles.length) return null;
  return (
    <ListGroup title="Featured in the news">
      {articles.map((a) => (
        <ListRow
          key={a.id}
          icon="globe"
          label={a.title}
          detail={a.newsletterTitle || undefined}
          onPress={() => navigation.navigate('Article', { articleId: a.id })}
        />
      ))}
    </ListGroup>
  );
}
