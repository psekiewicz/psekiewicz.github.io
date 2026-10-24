import { createNavigationContainerRef } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { siteRoute } from './siteRoutes';

// Every link tapped inside the app goes through openLink, so nothing drops
// the user out into another app:
//
// - A link to the website opens the same thing as an app screen - an entry,
//   an article, a newsletter, a profile, the leaderboard, the shop.
// - Any other web link (a demo's "Try it", its source, a news source, a link
//   in a description) opens in an in-app browser tab over the app, with a
//   close button that comes straight back.
// - Only what a browser can't show - mailto:, tel:, other apps' schemes -
//   goes to the system.
//
// It's the reverse direction that stays off on purpose: a website link
// tapped in some other app opens the browser, not this app (see the linking
// comment in navigation/RootNavigator.tsx).

export const navigationRef = createNavigationContainerRef<any>();

/** A web page in the in-app browser tab, even one on the website. */
export async function openInBrowserTab(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url, { showTitle: true, enableBarCollapsing: true });
  } catch {
    await Linking.openURL(url).catch(() => {});
  }
}

/** Opens `url` without leaving the app wherever that's possible. */
export async function openLink(url: string) {
  const route = siteRoute(url);
  if (route && navigationRef.isReady()) {
    navigationRef.navigate(route.name, route.params);
    return;
  }
  if (/^https?:\/\//i.test(url)) return openInBrowserTab(url);
  await Linking.openURL(url).catch(() => {});
}
