import { DarkTheme, DefaultTheme, LinkingOptions, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import React, { useState } from 'react';
import { Linking } from 'react-native';

import { SplashReveal } from '../components/SplashReveal';
import { BloomTabBar } from './BloomTabBar';
import { useAuth } from '../context/AuthContext';
import { AdminScreen } from '../screens/AdminScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { EditorScreen } from '../screens/EditorScreen';
import { FollowListScreen } from '../screens/FollowListScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LeaderboardScreen } from '../screens/LeaderboardScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { SavedScreen } from '../screens/SavedScreen';
import { ScrollsScreen } from '../screens/ScrollsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShopScreen } from '../screens/ShopScreen';
import { useTheme } from '../theme/ThemeProvider';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// The same five tabs the web build's bottom bar carries on narrow screens:
// Home / Scrolls / Add / Dashboard / Profile.
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
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Scrolls" component={ScrollsScreen} />
      {/* No Add tab. The add button pushes the `Editor` stack screen, which is
          the same screen editing and the share sheet already opened - one add
          screen rather than two that looked different, and the tab was the
          worse one: always mounted, so it needed code to blank itself between
          visits, and overlapped by the floating bar that kept swallowing its
          publish button. */}
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// A share arriving from another app reaches here as `showcase://share?...`,
// rewritten from Android's ACTION_SEND by plugins/withShareIntent.js. Declaring
// it as a deep link means React Navigation does the routing and the query
// string lands as route params, with no separate listener to keep in step.
//
// Links to the website are not claimed: they open in the browser, as a normal
// link does. (They used to open here through Android App Links; that was
// turned off on request.) ProjectDetail keeps a path so notifications can
// open an entry - `?id=` arrives as the `id` param - and initialRouteName
// puts the tabs underneath whatever a link opens, so back goes to Home.
//
// Tapping a notification from lib/notify.ts goes through here as well: each one
// carries a showcase:// URL, read below both at cold start and while running.
const notificationUrl = (response: Notifications.NotificationResponse | null) => {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' ? url : null;
};

const linking: LinkingOptions<Record<string, object | undefined>> = {
  prefixes: ['showcase://'],
  config: {
    initialRouteName: 'Tabs',
    screens: {
      Editor: 'share',
      ProjectDetail: 'project.html',
      UserProfile: 'user',
    },
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    return url ?? notificationUrl(await Notifications.getLastNotificationResponseAsync());
  },
  subscribe(listener) {
    const links = Linking.addEventListener('url', ({ url }) => listener(url));
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
  const { loading } = useAuth();
  const [revealed, setRevealed] = useState(false);

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
  if (loading || !revealed) {
    return <SplashReveal onDone={() => setRevealed(true)} />;
  }

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
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
          options={{ title: '' }}
        />
        <Stack.Screen name="Editor" component={EditorScreen} options={{ headerShown: false }} />
        <Stack.Screen name="UserProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
        <Stack.Screen name="FollowList" component={FollowListScreen} options={{ title: '' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen name="Shop" component={ShopScreen} options={{ title: 'Shop' }} />
        <Stack.Screen
          name="Leaderboard"
          component={LeaderboardScreen}
          options={{ title: 'Leaderboard' }}
        />
        <Stack.Screen name="Saved" component={SavedScreen} options={{ title: 'Saved' }} />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications' }}
        />
        <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Admin' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in' }} />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: 'Create account' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
