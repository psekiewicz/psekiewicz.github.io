import React, { forwardRef } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';

// JetBrains Mono everywhere, the same face as the website.
//
// React Native has no app-wide default font, and React 19 no longer applies
// defaultProps to function components, so every Text and TextInput in the app
// imports these instead of the react-native ones. The font is embedded at
// build time by the expo-font plugin in app.json as one family with real
// weights (400-800), so fontWeight keeps working as it did with the system
// font. A style that sets its own fontFamily (a shop name effect, a stack
// trace) still wins, because the base style goes first.
export const FONT_FAMILY = 'JetBrains Mono';

const base = { fontFamily: FONT_FAMILY };

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  return <RNText ref={ref} {...rest} style={[base, style]} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { style, ...rest },
  ref
) {
  return <RNTextInput ref={ref} {...rest} style={[base, style]} />;
});
