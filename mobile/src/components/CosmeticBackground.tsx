import { Image } from 'expo-image';
import React from 'react';
import { View, ViewStyle } from 'react-native';

import { bgImage } from '../lib/cosmetics';

/**
 * An equipped background: the same picture the web draws (assets/shop/bg/),
 * covering the box. Animated ones are animated WebP.
 */
export function CosmeticBackground({
  itemId,
  style,
  children,
}: {
  itemId: string;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const uri = bgImage(itemId);
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#e9e5dc' }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit="cover"
        />
      ) : null}
      {children}
    </View>
  );
}
