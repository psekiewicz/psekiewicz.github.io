import { useWindowDimensions } from 'react-native';

/**
 * Layout that follows the screen, rather than assuming a phone.
 *
 * Everything here was written for a ~5" portrait window: one column, images at
 * full width. On a 10" tablet that turns into a single stretched column where
 * one entry fills the display and a 16:9 thumbnail is over a thousand pixels
 * wide - while the website, on the very same tablet, lays the same entries out
 * in a readable grid. That gap is the whole reason the app can feel worse than
 * the site it mirrors.
 */

// The site's rule is `repeat(auto-fill, minmax(280px, 1fr))`. Using the same
// minimum here is what keeps the two looking like one product on one device.
export const MIN_CARD_WIDTH = 280;

export function useCardColumns() {
  const { width } = useWindowDimensions();
  return Math.max(1, Math.floor(width / MIN_CARD_WIDTH));
}

/**
 * A grid row with fewer items than columns would stretch its last card across
 * the whole row, because each one is `flex: 1`. Padding the data with blanks
 * keeps that card the size of every other card.
 */
export function padRow<T>(items: T[], columns: number): (T | null)[] {
  if (columns < 2) return items;
  const remainder = items.length % columns;
  if (remainder === 0) return items;
  return [...items, ...new Array(columns - remainder).fill(null)];
}

// Scrolls is a portrait, full-bleed feed - the shape of a phone held upright.
// Stretched over a tablet it is mostly empty space around a tall video, so it
// is pinned to a phone-width column and centred, which is exactly what the
// site does with it on a desktop.
export const MAX_FEED_WIDTH = 480;

export function useFeedWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width, MAX_FEED_WIDTH);
}
