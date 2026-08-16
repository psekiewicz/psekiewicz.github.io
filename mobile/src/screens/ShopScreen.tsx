import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Body,
  Button,
  Card,
  ErrorNote,
  Eyebrow,
  Heading,
  Loading,
  SuccessNote,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getProfile } from '../data/profiles';
import { equipItem, getOwnedItemIds, purchaseBundle, purchaseItem } from '../data/shop';
import { previewColors } from '../lib/cosmetics';
import {
  bundleMissingListPrice,
  bundlePriceFor,
  itemsByCategory,
  SHOP_BUNDLES,
  SHOP_CATEGORIES,
} from '../lib/shopItems';
import { formatCount } from '../lib/utils';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

export function ShopScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();

  const [points, setPoints] = useState(0);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<Record<string, string>>({
    bg: 'none',
    border: 'none',
    name: 'none',
  });
  const [tab, setTab] = useState<string>('bg');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const [profile, ownedIds] = await Promise.all([
        getProfile(user.id),
        getOwnedItemIds(user.id).catch(() => new Set<string>()),
      ]);
      setOwned(ownedIds);
      setPoints(profile?.points ?? 0);
      setEquipped({
        bg: profile?.equippedBg || 'none',
        border: profile?.equippedBorder || 'none',
        name: profile?.equippedNameEffect || 'none',
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const buy = async (itemId: string, price: number) => {
    if (!user) return navigation.navigate('Login');
    setError('');
    setNotice('');
    if (points < price) {
      setError("You don't have enough points for that yet.");
      return;
    }
    setBusyId(itemId);
    try {
      // purchase_item() charges and records ownership server-side; the number
      // it returns is the authority on the new balance.
      const newBalance = await purchaseItem(itemId);
      setPoints(newBalance);
      setOwned((prev) => new Set([...prev, itemId]));
      setNotice('Bought. Tap it again to equip.');
      refreshProfile();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const buyBundle = async (bundleId: string) => {
    if (!user) return navigation.navigate('Login');
    setError('');
    setNotice('');
    setBusyId(bundleId);
    try {
      const result = await purchaseBundle(bundleId);
      setPoints(result.points);
      setNotice(`Bought ${result.granted} item${result.granted === 1 ? '' : 's'} for ${result.charged} points.`);
      await load();
      refreshProfile();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const equip = async (category: string, itemId: string) => {
    if (!user) return;
    const previous = equipped[category];
    const next = equipped[category] === itemId ? 'none' : itemId;
    setEquipped((prev) => ({ ...prev, [category]: next }));
    try {
      await equipItem(user.id, category, next);
      refreshProfile();
    } catch (e: any) {
      setEquipped((prev) => ({ ...prev, [category]: previous }));
      setError(e.message);
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, justifyContent: 'center', gap: space.lg }}>
        <Heading>Shop</Heading>
        <Body muted>Sign in to spend points on cosmetics.</Body>
        <Button label="Sign in" onPress={() => navigation.navigate('Login')} />
      </View>
    );
  }

  if (loading) return <Loading />;

  const category = SHOP_CATEGORIES.find((c) => c.id === tab)!;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.lg }}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Eyebrow>Balance</Eyebrow>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>
              {formatCount(points)}
            </Text>
          </View>
          <Feather name="shopping-bag" size={22} color={colors.textFaint} />
        </View>
      </Card>

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      {/* Sets */}
      <View style={{ gap: space.sm }}>
        <Eyebrow>Sets</Eyebrow>
        {SHOP_BUNDLES.map((bundle) => {
          const price = bundlePriceFor(bundle, owned);
          const struck = bundleMissingListPrice(bundle, owned);
          const complete = price === 0;
          return (
            <Card key={bundle.id}>
              <Text style={{ fontWeight: '700', fontSize: 14, color: colors.text }}>
                {bundle.label}
              </Text>
              <Text style={[typography.small, { color: colors.textMuted, marginTop: 2 }]}>
                {bundle.blurb}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  marginTop: space.md,
                }}
              >
                {bundle.items.map((id) => (
                  <LinearGradient
                    key={id}
                    colors={previewColors(id) as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ width: 26, height: 26, borderRadius: radius.sm }}
                  />
                ))}
                <View style={{ flex: 1 }} />
                {complete ? (
                  <Text style={[typography.small, { color: colors.success, fontWeight: '700' }]}>
                    Owned
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    {struck > price ? (
                      <Text
                        style={[
                          typography.small,
                          { color: colors.textFaint, textDecorationLine: 'line-through' },
                        ]}
                      >
                        {struck}
                      </Text>
                    ) : null}
                    <Button
                      small
                      label={`${price}`}
                      loading={busyId === bundle.id}
                      onPress={() => buyBundle(bundle.id)}
                    />
                  </View>
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {/* Category tabs */}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {SHOP_CATEGORIES.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setTab(c.id)}
            style={{
              flex: 1,
              paddingVertical: space.sm,
              alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: tab === c.id ? colors.primary : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: tab === c.id ? colors.primary : colors.textMuted,
              }}
            >
              {c.id === 'bg' ? 'Backgrounds' : c.id === 'border' ? 'Borders' : 'Names'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[typography.small, { color: colors.textFaint }]}>{category.hint}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {itemsByCategory(tab).map((item) => {
          const isOwned = owned.has(item.id);
          const isEquipped = equipped[tab] === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => (isOwned ? equip(tab, item.id) : buy(item.id, item.price))}
              style={{
                width: '31.5%',
                borderRadius: radius.md,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: isEquipped ? colors.primary : colors.border,
                backgroundColor: colors.surface,
                overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={previewColors(item.id) as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 54, alignItems: 'center', justifyContent: 'center' }}
              >
                {isEquipped ? <Feather name="check" size={18} color="#fff" /> : null}
              </LinearGradient>
              <View style={{ padding: space.sm, gap: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    color: isOwned ? colors.success : colors.textFaint,
                  }}
                >
                  {isOwned ? (isEquipped ? 'Equipped' : 'Owned') : `${item.price} pts`}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={[typography.small, { color: colors.textFaint }]}>
        Prices are charged server-side — what you see here is a copy of the real list.
      </Text>
    </ScrollView>
  );
}
