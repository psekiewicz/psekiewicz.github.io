import { DarkTheme, DefaultTheme, LinkingOptions, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { AnnouncementPopup } from '../components/AnnouncementPopup';
import { SplashReveal } from '../components/SplashReveal';
import { BloomTabBar } from './BloomTabBar';
import { useAuth } from '../context/AuthContext';
import { getAccountAge, needsBirthDate } from '../data/age';
import { AdminScreen } from '../screens/AdminScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { DemosScreen } from '../screens/DemosScreen';
import { EditorScreen } from '../screens/EditorScreen';
import { FollowListScreen } from '../screens/FollowListScreen';
import { LeaderboardScreen } from '../screens/LeaderboardScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { BirthDateGate } from '../screens/BirthDateGate';
import { hasSeenIntro, IntroRoute, IntroScreen, markIntroSeen } from '../features/intro';
import { LegalScreen } from '../screens/LegalScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { SavedScreen } from '../screens/SavedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShopScreen } from '../screens/ShopScreen';
import { ArticleScreen } from '../screens/ArticleScreen';
import { NewsletterEditorsScreen } from '../screens/NewsletterEditorsScreen';
import { NewsletterScreen } from '../screens/NewsletterScreen';
import { NewsEditorScreen } from '../screens/NewsEditorScreen';
import { NewsScreen } from '../screens/NewsScreen';
import { UpdateScreen } from '../features/app-update'; // app-update
import { handleAuthLink, isAuthLink } from '../lib/authLinks';
import { navigationRef } from '../lib/links';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { useTheme } from '../theme/ThemeProvider';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// The same bar the website carries on narrow screens: Demos / News / Add /
// Ranks / You. The two things to read come first, then the leaderboard, then
// you - and everything that's yours (your work, saved, the shop, settings)
// is a list on You rather than a tab or a stray button somewhere else.
function Tabs() {
  return (
    <Tab.Navigator
      // React Navigation 7 types `id` as required even though it's optional at
      // runtime; passing undefined is the documented way to say "no id".
      id={undefined}
      // Bloom draws its own floating pill instead of styling the stock bar: the
      // add button overhangs the bar's top edge and is not a tab at all, which
      // no combination of tabBarStyle/tabBarIcon can express.
      tabBar={(props) => <BloomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Demos" component={DemosScreen} />
      <Tab.Screen name="News" component={NewsScreen} />
      {/* No Add tab. The add button pushes the `Editor` stack screen, which is
          the same screen editing and the share sheet already opened - one add
          screen rather than two that looked different, and the tab was the
          worse one: always mounted, so it needed code to blank itself between
          visits, and overlapped by the floating bar that kept swallowing its
          publish button. */}
      <Tab.Screen name="Ranks" component={LeaderboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// A share arriving from another app reaches here as `showcase://share?...`,
// rewritten from Android's ACTION_SEND by plugins/withShareIntent.js. Declaring
// it as a deep link means React Navigation does the routing and the query
// string lands as route params, with no separate listener to keep in step.
//
// Links to the website are not claimed: one tapped in another app opens the
// browser, as a normal link does. (They used to open here through Android App
// Links; that was turned off on request.) Inside the app it's the other way
// round - lib/links.ts sends a tapped website link to the matching screen.
// ProjectDetail keeps a path so notifications can open an entry - `?id=`
// arrives as the `id` param - and initialRouteName puts the tabs underneath
// whatever a link opens, so back goes to Demos.
//
// showcase://auth is the way back from a sign-up or password-reset email
// (lib/authLinks.ts). It's handled here before routing: the session is set
// first, then a reset continues to the Reset password screen.
//
// Tapping a notification from lib/notify.ts goes through here as well: each one
// carries a showcase:// URL, read below both at cold start and while running.
const notificationUrl = (response: Notifications.NotificationResponse | null) => {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' ? url : null;
};

async function afterAuthLink(url: string) {
  const result = await handleAuthLink(url);
  if (result.kind === 'error') {
    Alert.alert('That link did not work', result.message);
    return null;
  }
  if (result.kind === 'recovery') return 'showcase://reset-password';
  Alert.alert('Email confirmed', "You're signed in. Welcome to XOXD!");
  return null;
}

const linking: LinkingOptions<Record<string, object | undefined>> = {
  prefixes: ['showcase://'],
  config: {
    initialRouteName: 'Tabs',
    screens: {
      Editor: 'share',
      ProjectDetail: 'project.html',
      UserProfile: 'user',
      ResetPassword: 'reset-password',
    },
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (isAuthLink(url)) return afterAuthLink(url);
    return url ?? notificationUrl(await Notifications.getLastNotificationResponseAsync());
  },
  subscribe(listener) {
    const links = Linking.addEventListener('url', ({ url }) => {
      if (!isAuthLink(url)) return listener(url);
      afterAuthLink(url).then((next) => next && listener(next));
    });
    const taps = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = notificationUrl(response);
      if (url) listener(url);
    });
    return () => {
      links.remove();
      taps.remove();
    };
  },
};

export function RootNavigator() {
  const { colors, dark } = useTheme();
  const { loading, user } = useAuth();
  const [revealed, setRevealed] = useState(false);

  // An account with no date of birth on it cannot write anything - the
  // database refuses it - so the app asks for one before letting anybody in,
  // rather than leaving them to discover it as a wall of failures. Every
  // account made before the age rules existed is in that position.
  const [ageChecked, setAgeChecked] = useState(false);
  const [needsAge, setNeedsAge] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // A fresh install opens on the intro (features/intro), once. Where it sends
  // the person - Create account or Sign in - is opened as soon as the
  // navigator is ready.
  const [introChecked, setIntroChecked] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const afterIntro = useRef<string | null>(null);
  useEffect(() => {
    hasSeenIntro().then((seen) => {
      setShowIntro(!seen);
      setIntroChecked(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setNeedsAge(false);
      setAgeChecked(true);
      setDismissed(false);
      return;
    }
    setAgeChecked(false);
    (async () => {
      // A failed check must not lock somebody out of their own account, so
      // this fails open. The database is still what actually refuses a write.
      const age = await getAccountAge(user.id).catch(() => null);
      if (cancelled) return;
      setNeedsAge(needsBirthDate(age));
      setAgeChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  // Two conditions, not one. `loading` is the real work - the persisted session
  // being read off disk - and holding for it is what stops a cold start
  // flashing the signed-out UI at someone who is signed in. `revealed` is the
  // splash animation having actually finished: that read takes a fraction of
  // the time the reveal does, so waiting on it alone meant the splash was cut
  // off mid-flight, at a different frame every launch. Whichever takes longer
  // now decides, and SplashReveal bounds its own half so this can never hang.
  if (loading || !revealed || !introChecked || (user && !ageChecked)) {
    return <SplashReveal onDone={() => setRevealed(true)} />;
  }

  if (showIntro && !user) {
    return (
      <IntroScreen
        onFinish={(exit) => {
          markIntroSeen();
          afterIntro.current = exit === 'register' ? 'Register' : exit === 'login' ? 'Login' : null;
          setShowIntro(false);
        }}
      />
    );
  }

  if (user && needsAge && !dismissed) {
    return <BirthDateGate onDone={() => setDismissed(true)} />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      linking={linking}
      onReady={() => {
        if (afterIntro.current) navigationRef.navigate(afterIntro.current);
        afterIntro.current = null;
      }}
    >
      <Stack.Navigator
        id={undefined}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: 15, fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="ProjectDetail"
          component={ProjectDetailScreen}
          options={{ title: 'Post' }}
        />
        <Stack.Screen name="Editor" component={EditorScreen} options={{ headerShown: false }} />
        <Stack.Screen name="UserProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
        <Stack.Screen name="FollowList" component={FollowListScreen} options={{ title: '' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen name="Shop" component={ShopScreen} options={{ title: 'Shop' }} />
        <Stack.Screen name="YourWork" component={DashboardScreen} options={{ title: 'Your work' }} />
        <Stack.Screen name="Saved" component={SavedScreen} options={{ title: 'Saved' }} />
        <Stack.Screen name="Newsletter" component={NewsletterScreen} options={{ title: '' }} />
        <Stack.Screen name="Article" component={ArticleScreen} options={{ title: '' }} />
        <Stack.Screen name="NewsEditor" component={NewsEditorScreen} options={{ title: '' }} />
        <Stack.Screen name="NewsletterEditors" component={NewsletterEditorsScreen} options={{ title: '' }} />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications' }}
        />
        <Stack.Screen name="AppUpdate" component={UpdateScreen} options={{ title: 'App updates' }} /* app-update */ />
        <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Admin' }} />
        <Stack.Screen name="Legal" component={LegalScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in' }} />
        <Stack.Screen name="Intro" component={IntroRoute} options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'Reset password' }} />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: 'Create account' }}
        />
      </Stack.Navigator>
      <AnnouncementPopup />
    </NavigationContainer>
  );
}
