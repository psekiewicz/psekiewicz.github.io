import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, ImageBackground, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProjectCard } from '../components/ProjectCard';
import {
  Avatar,
  Body,
  Button,
  Card,
  DisplayName,
  EmptyState,
  ErrorNote,
  Eyebrow,
  Heading,
  IconButton,
  LevelChip,
  Loading,
  ProgressBar,
  Stat,
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
  getUserStats,
  unrecordedAchievementIds,
  UserStats,
} from '../lib/achievements';
import { bgGradient } from '../lib/cosmetics';
import { levelFromXp } from '../lib/levels';
import { formatCount } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

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

  // Shared between the LinearGradient and ImageBackground header wrappers
  // below - which one wears the equipped background is the only thing that
  // differs, per bg-blocks being a real image rather than a gradient.
  const headerBody = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Avatar
          url={profile?.avatarUrl}
          name={profile?.displayName}
          size={64}
          ring={profile?.equippedBorder}
        />
        <View style={{ flex: 1 }} />
        {isSelf ? (
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon="bookmark"
              label="Saved"
              color={gradient ? '#fff' : colors.textMuted}
              onPress={() => navigation.navigate('Saved')}
            />
            <IconButton
              icon="shopping-bag"
              label="Shop"
              color={gradient ? '#fff' : colors.textMuted}
              onPress={() => navigation.navigate('Shop')}
            />
            <IconButton
              icon="settings"
              label="Settings"
              color={gradient ? '#fff' : colors.textMuted}
              onPress={() => navigation.navigate('Settings')}
            />
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <DisplayName
          name={profile?.displayName || 'Unknown'}
          effect={profile?.equippedNameEffect}
          style={{ fontSize: 20, color: gradient ? '#fff' : colors.text }}
        />
        <LevelChip level={level.level} />
      </View>

      {profile?.bio ? (
        <Text style={[typography.body, { color: gradient ? 'rgba(255,255,255,0.9)' : colors.textMuted }]}>
          {profile.bio}
        </Text>
      ) : null}
    </>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={projects}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: space.xxl, gap: space.lg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: space.lg }}>
          {/* Header, wearing the equipped background cosmetic. */}
          <View style={{ paddingTop: route.params?.userId ? 0 : insets.top }}>
            {gradient?.image ? (
              <ImageBackground
                source={{ uri: gradient.image }}
                resizeMode="cover"
                style={{ paddingHorizontal: space.lg, paddingVertical: space.xl, gap: space.md }}
              >
                {headerBody}
              </ImageBackground>
            ) : (
              <LinearGradient
                colors={
                  gradient
                    ? (gradient.colors as any)
                    : [colors.mutedSoft, colors.bg]
                }
                start={gradient?.start || { x: 0, y: 0 }}
                end={gradient?.end || { x: 1, y: 1 }}
                style={{ paddingHorizontal: space.lg, paddingVertical: space.xl, gap: space.md }}
              >
                {headerBody}
              </LinearGradient>
            )}
          </View>

          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <ErrorNote message={error} />

            {!isSelf && user ? (
              <Button
                label={following ? 'Following' : 'Follow'}
                variant={following ? 'secondary' : 'primary'}
                icon={following ? 'check' : 'plus'}
                onPress={toggleFollow}
              />
            ) : null}

            <Card>
              <View style={{ flexDirection: 'row' }}>
                <Stat label="Entries" value={projects.length} />
                <Stat label="Followers" value={formatCount(followers)} />
                <Stat label="Following" value={formatCount(followingCount)} />
                <Stat label="Likes" value={formatCount(reputation?.likesReceived ?? 0)} />
              </View>
            </Card>

            {/* Level */}
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
                <Eyebrow>Level {level.level}</Eyebrow>
                <View style={{ flex: 1 }} />
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  {level.xpIntoLevel} / {level.xpForNextLevel} XP
                </Text>
              </View>
              <ProgressBar progress={level.progress} />
              <Text style={[typography.small, { color: colors.textFaint, marginTop: space.sm }]}>
                XP comes from what other people did with your work - distinct viewers, likes,
                comments received, followers.
              </Text>
            </Card>

            {isSelf ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Eyebrow>Points</Eyebrow>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>
                      {formatCount(myProfile?.points ?? profile?.points ?? 0)}
                    </Text>
                  </View>
                  <Button
                    small
                    label="Shop"
                    icon="shopping-bag"
                    variant="secondary"
                    onPress={() => navigation.navigate('Shop')}
                  />
                </View>
              </Card>
            ) : null}

            {/* Achievements */}
            {achievements.length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Eyebrow>
                  Achievements · {unlockedList.length}/{achievements.length}
                </Eyebrow>
                <View style={{ gap: space.sm }}>
                  {achievements.map((a) => {
                    const claimable = isSelf && a.unlocked && !claimed.has(a.id);
                    return (
                      <View
                        key={a.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space.md,
                          padding: space.md,
                          borderRadius: radius.sm,
                          borderWidth: StyleSheet.hairlineWidth * 2,
                          borderColor: a.unlocked ? colors.borderStrong : colors.border,
                          backgroundColor: a.unlocked ? colors.surface : 'transparent',
                          opacity: a.unlocked ? 1 : 0.45,
                        }}
                      >
                        <Feather
                          name={a.icon as any}
                          size={18}
                          color={a.unlocked ? colors.primary : colors.textFaint}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '700', fontSize: 13, color: colors.text }}>
                            {a.label}
                          </Text>
                          <Text style={[typography.small, { color: colors.textFaint }]}>
                            {a.description}
                          </Text>
                        </View>
                        {claimable ? (
                          <Button
                            small
                            label={`+${a.reward}`}
                            onPress={() => claim(a.id)}
                          />
                        ) : a.unlocked && isSelf ? (
                          <Feather name="check" size={16} color={colors.success} />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
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

            <Eyebrow style={{ marginTop: space.sm }}>Published</Eyebrow>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={{ paddingHorizontal: space.lg }}>
          <EmptyState
            icon="package"
            title="Nothing published"
            body={isSelf ? 'Your published entries show up here.' : 'This account has no public entries yet.'}
          />
        </View>
      }
      renderItem={({ item, index }) => (
        <View style={{ paddingHorizontal: space.lg }}>
          <ProjectCard
            project={item}
            author={profile ? { displayName: profile.displayName, avatarUrl: profile.avatarUrl, equippedBorder: profile.equippedBorder } : undefined}
            level={level.level}
            onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
            index={index}
          />
        </View>
      )}
    />
  );
}
