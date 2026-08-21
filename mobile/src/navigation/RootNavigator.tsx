import { Feather } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { AdminScreen } from '../screens/AdminScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { EditorScreen } from '../screens/EditorScreen';
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
  const { colors } = useTheme();
  // The app draws edge to edge, so the bottom of the window sits *behind* the
  // system navigation bar. React Navigation normally pads the tab bar clear of
  // it on its own — but only while it owns the height, and setting height and
  // paddingBottom below takes that over. Without adding the inset back, the
  // whole bar renders underneath the system one: invisible, untappable, and
  // with it every screen except this one.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      // React Navigation 7 types `id` as required even though it's optional at
      // runtime; passing undefined is the documented way to say "no id".
      id={undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          height: 58 + insets.bottom,
          paddingBottom: 6 + insets.bottom,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, any> = {
            Home: 'home',
            Scrolls: 'play-circle',
            Add: 'plus-square',
            Dashboard: 'bar-chart-2',
            Profile: 'user',
          };
          return <Feather name={map[route.name] || 'circle'} size={size - 2} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Scrolls" component={ScrollsScreen} />
      {/* The Add tab carries no params, so it is always a blank new entry.
          Editing goes to the `Editor` stack screen instead. Keeping the tab
          param-less is what lets the editor tell the two apart. */}
      <Tab.Screen name="Add" component={EditorScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// A share arriving from another app reaches here as `showcase://share?...`,
// rewritten from Android's ACTION_SEND by plugins/withShareIntent.js. Declaring
// it as a deep link means React Navigation does the routing and the query
// string lands as route params, with no separate listener to keep in step.
const linking = {
  prefixes: ['showcase://'],
  config: {
    screens: {
      Editor: 'share',
    },
  },
};

export function RootNavigator() {
  const { colors, dark } = useTheme();
  const { loading } = useAuth();

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

  // Held until the persisted session has been read off disk, so a cold start
  // never flashes the signed-out UI at someone who is signed in.
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
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
        <Stack.Screen name="Editor" component={EditorScreen} options={{ title: 'Entry' }} />
        <Stack.Screen name="UserProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
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
