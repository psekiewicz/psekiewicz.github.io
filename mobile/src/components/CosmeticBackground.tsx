import { Image } from 'expo-image';
import React from 'react';
import { View, ViewStyle } from 'react-native';

import { bgImage } from '../lib/cosmetics';
import { useMotion } from '../theme/MotionProvider';

/**
 * An equipped background: the same picture the web draws (assets/shop/bg/),
 * covering the box. Animated ones are animated WebP, held on their first frame
 * when animations are off (the web's .still.webp is that same frame).
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
  const { enabled: motion } = useMotion();
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#e9e5dc' }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit="cover"
          autoplay={motion}
        />
      ) : null}
      {children}
    </View>
  );
}
