import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';

import {
  Avatar,
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
import { CosmeticBackground } from '../components/CosmeticBackground';
import { nameStyle } from '../lib/cosmetics';
import {
  bundleMissingListPrice,
  bundlePriceFor,
  itemsByCategory,
  rarityOf,
  SHOP_BUNDLES,
  SHOP_CATEGORIES,
} from '../lib/shopItems';
import { formatCount } from '../lib/utils';
import { column, MAX_PAGE_WIDTH } from '../lib/layout';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, typography } from '../theme/tokens';

// What an item looks like, as a tile: the background itself, an avatar
// wearing the frame, or a nickname in its colour. `size` makes a square one.
function Swatch({
  itemId,
  size,
  height,
  children,
}: {
  itemId: string;
  size?: number;
  height?: number;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const box = size ? { width: size, height: size } : { height: height || 54 };
  const centre = { alignItems: 'center', justifyContent: 'center' } as const;

  if (itemId.startsWith('bg-')) {
    return (
      <CosmeticBackground
        itemId={itemId}
        style={size ? { ...box, borderRadius: radius.sm, ...centre } : { ...box, ...centre }}
      >
        {children}
      </CosmeticBackground>
    );
  }

  const avatarSize = size ? size * 0.62 : (height || 54) * 0.6;
  return (
    <View
      style={{ ...box, backgroundColor: colors.surfaceAlt || colors.border, borderRadius: size ? radius.sm : 0, ...centre }}
    >
      {itemId.startsWith('border-') ? (
        <Avatar name="P" size={avatarSize} ring={itemId} />
      ) : (
        <Text style={[{ fontWeight: '800', fontSize: size ? 13 : 16, color: colors.text }, nameStyle(itemId) as any]}>
          Peter
        </Text>
      )}
      {children ? <View style={{ position: 'absolute' }}>{children}</View> : null}
    </View>
  );
}

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
      contentContainerStyle={{ ...column(MAX_PAGE_WIDTH), padding: space.lg, paddingBottom: space.xxl, gap: space.lg }}
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
                  <Swatch key={id} itemId={id} size={34} />
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
              <Swatch itemId={item.id} height={54}>
                {isEquipped ? <Feather name="check" size={18} color="#fff" /> : null}
              </Swatch>
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
                  {isOwned ? (isEquipped ? 'Equipped' : 'Owned') : `${item.price} pts \u00b7 ${rarityOf(item).label}`}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={[typography.small, { color: colors.textFaint }]}>
        Prices are charged server-side - what you see here is a copy of the real list.
      </Text>
    </ScrollView>
  );
}
