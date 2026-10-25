import AsyncStorage from '@react-native-async-storage/async-storage';

// Whether this install has shown the intro yet. Kept on the device, not the
// account: it is about this copy of the app, and someone who is signed out
// must still be asked only once.
const KEY = 'xoxd.introSeen';

export async function hasSeenIntro() {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    // Storage unreadable: better to skip the intro than to show it every launch.
    return true;
  }
}

export function markIntroSeen() {
  return AsyncStorage.setItem(KEY, '1').catch(() => {});
}
