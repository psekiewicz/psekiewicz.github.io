import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, ImageBackground, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderButton, SectionRule, StatBlock } from '../components/bloom';
import { CosmeticBackground } from '../components/CosmeticBackground';
import { Icon, IconName } from '../components/icons';
import { placeholderFor } from '../components/ProjectCard';
import { StatsCardSheet } from '../components/StatsCardSheet';
import {
  Avatar,
  Body,
  Button,
  DisplayName,
  EmptyState,
  ErrorNote,
  Heading,
  Loading,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../data/admin';
import { followUser, getFollowerCount, getFollowingCount, isFollowing, unfollowUser } from '../data/follows';
import { getProfile, Profile } from '../data/profiles';
import { getPublishedProjectsByUser, Project } from '../data/projects';
import { getReputation, Reputation } from '../data/reputation';
import {
  claimAchievement,
  getAchievementRecords,
  recordAchievementUnlock,
} from '../data/shop';
import {
  computeAchievements,
  getTopAchievement,
  getUserStats,
  unrecordedAchievementIds,
  UserStats,
} from '../lib/achievements';
import { bgGradient } from '../lib/cosmetics';
import { levelFromXp } from '../lib/levels';
import { coverFor } from '../lib/media';
import { formatCount } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { gutter, radius, space, typography } from '../theme/tokens';

export function ProfileScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile: myProfile, refreshProfile } = useAuth();

  // Reached two ways: as the Profile tab (no params - your own) and pushed
  // from a card (a userId param - somebody else's).
  const targetId = route.params?.userId || user?.id || null;
  const isSelf = !!user && targetId === user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [admin, setAdmin] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!targetId) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const [profileRow, rows, rep, followerCount, followCount, follows] = await Promise.all([
        getProfile(targetId),
        getPublishedProjectsByUser(targetId).catch(() => []),
        getReputation(targetId).catch(() => null),
        getFollowerCount(targetId).catch(() => 0),
        getFollowingCount(targetId).catch(() => 0),
        user && !isSelf ? isFollowing(user.id, targetId).catch(() => false) : Promise.resolve(false),
      ]);

      setProfile(profileRow);
      setProjects(rows);
      setReputation(rep);
      setFollowers(followerCount);
      setFollowingCount(followCount);
      setFollowing(follows);

      // Achievements: the live stats plus whatever has been recorded
      // server-side. Recording is only ever done for your own profile.
      const [userStats, records] = await Promise.all([
        getUserStats(targetId).catch(() => null),
        getAchievementRecords(targetId).catch(() => ({
          unlocked: new Set<string>(),
          claimed: new Set<string>(),
        })),
      ]);
      setStats(userStats);
      setUnlocked(records.unlocked);
      setClaimed(records.claimed);

      if (isSelf && userStats) {
        // Anything the live stats qualify for but that isn't recorded yet gets
        // written down now, so it sticks even if the activity behind it goes
        // away later. Eligibility is re-checked server-side.
        const pending = unrecordedAchievementIds(userStats, records.unlocked);
        if (pending.length) {
          await Promise.all(pending.map((id) => recordAchievementUnlock(id).catch(() => {})));
          setUnlocked(new Set([...records.unlocked, ...pending]));
        }
        setAdmin(await isAdmin(user!.id).catch(() => false));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetId, isSelf, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const toggleFollow = async () => {
    if (!user) return navigation.navigate('Login');
    const next = !following;
    setFollowing(next);
    setFollowers((c) => c + (next ? 1 : -1));
    try {
      if (next) await followUser(user.id, targetId);
      else await unfollowUser(user.id, targetId);
    } catch {
      setFollowing(!next);
      setFollowers((c) => c + (next ? -1 : 1));
    }
  };

  const claim = async (achievementId: string) => {
    try {
      await claimAchievement(achievementId);
      setClaimed((prev) => new Set([...prev, achievementId]));
      refreshProfile();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!targetId) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: space.xl,
          justifyContent: 'center',
          gap: space.lg,
        }}
      >
        <Heading>Your profile</Heading>
        <Body muted>Sign in to see your work, level and achievements.</Body>
        <Button label="Sign in" onPress={() => navigation.navigate('Login')} />
        <Button
          label="Create account"
          variant="secondary"
          onPress={() => navigation.navigate('Register')}
        />
      </View>
    );
  }

  if (loading) return <Loading />;

  const level = levelFromXp(reputation?.xp ?? 0);
  const gradient = bgGradient(profile?.equippedBg || 'none');
  const achievements = stats ? computeAchievements(stats, unlocked) : [];
  const unlockedList = achievements.filter((a) => a.unlocked);
  const claimable = isSelf ? unlockedList.filter((a) => !claimed.has(a.id)) : [];
  const claimableXp = claimable.reduce((sum, a) => sum + a.reward, 0);
  // Your own count comes from the auth context, which refreshes after a claim
  // or a purchase; anyone else's is on their profile row. Preferring the
  // context unconditionally showed your points on every profile you visited.
  const points = (isSelf ? myProfile?.points ?? profile?.points : profile?.points) ?? 0;
  const joined = profile?.createdAt ? new Date(profile.createdAt).getFullYear() : null;

  // Bloom's header is a band whose bottom corners round off into the page, with
  // the avatar hanging below it. The equipped background cosmetic still wears
  // it - which wrapper is used is the only thing that differs, per bg-blocks
  // being a real image rather than a gradient.
  const headerContent = (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -70,
          right: -40,
          width: 170,
          height: 170,
          borderRadius: radius.pill,
          backgroundColor: 'rgba(122,138,94,0.34)',
        }}
      />
      {isSelf ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            right: 20,
            flexDirection: 'row',
            gap: 10,
          }}
        >
          <HeaderButton
            size={38}
            icon="bookmark"
            label="Saved"
            onPress={() => navigation.navigate('Saved')}
          />
          <HeaderButton
            size={38}
            icon="settings"
            label="Settings"
            onPress={() => navigation.navigate('Settings')}
          />
        </View>
      ) : null}
      <Text
        style={[
          typography.eyebrow,
          { position: 'absolute', right: gutter, bottom: 16, color: 'rgba(253,247,234,0.85)' },
        ]}
      >
        {projects.length} {projects.length === 1 ? 'entry' : 'entries'}
      </Text>
    </>
  );

  const headerStyle = {
    height: 158 + (route.params?.userId ? 0 : insets.top),
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden' as const,
  };

  return (
    <>
      {isSelf && stats ? (
        <StatsCardSheet
          visible={showCard}
          onClose={() => setShowCard(false)}
          profile={profile}
          level={level}
          stats={stats}
          topAchievement={getTopAchievement(stats, unlocked)}
        />
      ) : null}
      <FlatList
        style={{ flex: 1, backgroundColor: colors.bg }}
        data={projects}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: gutter }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 116, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
            // tintColor is iOS-only; Android's spinner disc is white without these.
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
        ListHeaderComponent={
          <View>
            {/* The equipped background, drawn by CosmeticBackground so a
                patterned one is the real tiled pattern rather than a flattened
                gradient. `none` falls through to Bloom's own terracotta band. */}
            {profile?.equippedBg && profile.equippedBg !== 'none' ? (
              <CosmeticBackground itemId={profile.equippedBg} style={headerStyle}>
                {headerContent}
              </CosmeticBackground>
            ) : (
              <LinearGradient
                colors={['#d98a4f', colors.primary, '#8f4a1e']}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={headerStyle}
              >
                {headerContent}
              </LinearGradient>
            )}

            {/* The avatar overlaps the band above it. */}
            <View style={{ paddingHorizontal: gutter, marginTop: -44, gap: 16 }}>
              <View style={{ width: 92, height: 92 }}>
                <View style={{ borderWidth: 5, borderColor: colors.bg, borderRadius: radius.pill }}>
                  <Avatar
                    url={profile?.avatarUrl}
                    name={profile?.displayName}
                    size={82}
                    ring={profile?.equippedBorder}
                  />
                </View>
                <View
                  style={{
                    position: 'absolute',
                    right: -6,
                    bottom: -2,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    backgroundColor: colors.text,
                    borderWidth: 3,
                    borderColor: colors.bg,
                  }}
                >
                  <Text
                    style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.bg }}
                  >
                    LV {level.level}
                  </Text>
                </View>
              </View>

              <View style={{ gap: 5 }}>
                <DisplayName
                  name={profile?.displayName || 'Unknown'}
                  effect={profile?.equippedNameEffect}
                  style={[typography.h2, { color: colors.text }]}
                />
                {/* The artboard sets a handle here ("@marakell · joined 2023").
                    Profiles carry no username, so this keeps the half that has a
                    source rather than inventing one. */}
                <Text style={{ fontSize: 12, color: colors.textFaint }}>
                  {joined ? `joined ${joined} · ` : ''}
                  {level.xp} XP
                </Text>
                {profile?.bio ? (
                  <Text style={[typography.body, { color: colors.textMuted, marginTop: 5 }]}>
                    {profile.bio}
                  </Text>
                ) : null}
              </View>

              <ErrorNote message={error} />

              {/* The dark pill is this screen's one primary action: on your own
                  profile it claims what you are owed (or sends you to the shop
                  once there is nothing left), on somebody else's it follows. */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {isSelf ? (
                  <>
                    <Pressable
                      onPress={() =>
                        claimable.length
                          ? claimable.forEach((a) => claim(a.id))
                          : navigation.navigate('Shop')
                      }
                      style={({ pressed }) => ({
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 9,
                        backgroundColor: colors.text,
                        borderRadius: radius.pill,
                        padding: 14,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Icon
                        name="star"
                        size={15}
                        color={colors.bg}
                        fill={claimable.length ? colors.bg : 'none'}
                      />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.bg }}>
                        {claimable.length
                          ? `Claim +${claimableXp} XP`
                          : `Shop · ${formatCount(points)}`}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => navigation.navigate('Settings')}
                      accessibilityRole="button"
                      accessibilityLabel="Edit profile"
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: radius.pill,
                        backgroundColor: colors.primarySoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="pencil" size={19} color={colors.primaryDeep} />
                    </Pressable>
                  </>
                ) : user ? (
                  <Button
                    label={following ? 'Following' : 'Follow'}
                    variant={following ? 'secondary' : 'primary'}
                    icon={following ? 'check' : 'plus'}
                    style={{ flex: 1 }}
                    onPress={toggleFollow}
                  />
                ) : null}
              </View>

              {isSelf && stats ? (
                <Button
                  label="Share stats card"
                  icon="share-2"
                  variant="secondary"
                  small
                  onPress={() => setShowCard(true)}
                />
              ) : null}

              {/* Next level */}
              <View
                style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 18, gap: 10 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[typography.label, { letterSpacing: 1.8, color: colors.accent }]}>
                    Next level
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primaryDeep }}>
                    {level.xpIntoLevel} / {level.xpForNextLevel} XP
                  </Text>
                </View>
                <View
                  style={{
                    height: 12,
                    borderRadius: radius.pill,
                    backgroundColor: colors.border,
                    overflow: 'hidden',
                  }}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      height: '100%',
                      width: `${Math.round(Math.max(0, Math.min(1, level.progress)) * 100)}%`,
                      borderRadius: radius.pill,
                    }}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 20, marginTop: 4 }}>
                  {/* Tappable, as the site's counts are: each opens the list of
                      people behind the number. */}
                  <Pressable
                    onPress={() => navigation.navigate('FollowList', { userId: targetId, mode: 'followers' })}
                    accessibilityRole="button"
                    accessibilityLabel={`${followers} followers`}
                    hitSlop={8}
                  >
                    <StatBlock value={formatCount(followers)} label="Followers" />
                  </Pressable>
                  <Pressable
                    onPress={() => navigation.navigate('FollowList', { userId: targetId, mode: 'following' })}
                    accessibilityRole="button"
                    accessibilityLabel={`${followingCount} following`}
                    hitSlop={8}
                  >
                    <StatBlock value={formatCount(followingCount)} label="Following" />
                  </Pressable>
                  <StatBlock value={formatCount(points)} label="Points" />
                </View>
              </View>

              {/* Achievements, three to a row. */}
              {achievements.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {chunk(achievements, 3).map((row, rowIndex) => (
                    <View key={rowIndex} style={{ flexDirection: 'row', gap: 10 }}>
                      {row.map((a, colIndex) =>
                        a ? (
                          <AchievementTile
                            key={a.id}
                            achievement={a}
                            claimable={isSelf && a.unlocked && !claimed.has(a.id)}
                            onClaim={() => claim(a.id)}
                          />
                        ) : (
                          // Holds the column open so a short last row keeps the
                          // same tile width as every full row.
                          <View key={`pad-${colIndex}`} style={{ flex: 1 }} />
                        )
                      )}
                    </View>
                  ))}
                </View>
              ) : null}

              {isSelf && admin ? (
                <Button
                  label="Admin panel"
                  icon="shield"
                  variant="secondary"
                  onPress={() => navigation.navigate('Admin')}
                />
              ) : null}

              <SectionRule label="Published" trailing={projects.length} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: gutter }}>
            <EmptyState
              icon="package"
              title="Nothing published"
              body={
                isSelf
                  ? 'Your published entries show up here.'
                  : 'This account has no public entries yet.'
              }
            />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
            style={{ flex: 1, aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' }}
          >
            {coverFor(item) ? (
              <Image
                source={{ uri: coverFor(item) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <LinearGradient
                colors={placeholderFor(item.type) as any}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={{ width: '100%', height: '100%' }}
              />
            )}
          </Pressable>
        )}
      />
    </>
  );
}

function AchievementTile({
  achievement,
  claimable,
  onClaim,
}: {
  achievement: { id: string; label: string; description: string; icon: string; reward: number; unlocked: boolean };
  claimable: boolean;
  onClaim: () => void;
}) {
  const { colors } = useTheme();
  const tone = !achievement.unlocked
    ? { bg: colors.mutedSoft, fg: colors.textMuted }
    : claimable
      ? { bg: colors.primarySoft, fg: colors.primaryDeep }
      : { bg: colors.accentSoft, fg: colors.accentDeep };
  const label = claimable ? `+${achievement.reward} XP` : achievement.label.toUpperCase();

  return (
    <Pressable
      disabled={!claimable}
      onPress={onClaim}
      accessibilityLabel={`${achievement.label}. ${achievement.description}`}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: tone.bg,
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 14,
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: !achievement.unlocked ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Icon
        name={achievement.unlocked ? achievementIcon(achievement.icon) : 'lock'}
        size={22}
        color={tone.fg}
      />
      {/* One line per word at most, shrinking to fit: Android breaks a word
          wider than the tile mid-word, which split CONVERSATIONALIST into
          "CONVERSATIONA / LIST" on a phone-width grid. */}
      <Text
        numberOfLines={Math.min(label.split(' ').length, 2)}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.8,
          color: tone.fg,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Split into rows of `size`, padding the last one with nulls. */
function chunk<T>(items: T[], size: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += size) {
    const row: (T | null)[] = items.slice(i, i + size);
    while (row.length < size) row.push(null);
    rows.push(row);
  }
  return rows;
}

// The achievement set is labelled with Feather names, from when the app drew
// its icons from that font. Bloom's tiles come from the artboard's Lucide set,
// whose own vocabulary here is star / person / lock, so anything without a
// direct counterpart lands on the star.
function achievementIcon(name: string): IconName {
  const map: Record<string, IconName> = {
    heart: 'heart',
    'message-circle': 'comment',
    users: 'user',
    'shopping-bag': 'bookmark',
    grid: 'image',
    eye: 'search',
  };
  return map[name] || 'star';
}
