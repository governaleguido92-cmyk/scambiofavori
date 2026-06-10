import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  FAVORS: 'cache_favors',
  USER: 'cache_user',
};

export const offlineCache = {
  saveFavors: async (favors: any[]) => {
    try {
      await AsyncStorage.setItem(KEYS.FAVORS, JSON.stringify({ data: favors, ts: Date.now() }));
    } catch {}
  },

  loadFavors: async (): Promise<any[] | null> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.FAVORS);
      if (!raw) return null;
      const { data } = JSON.parse(raw);
      return data;
    } catch {
      return null;
    }
  },

  saveUser: async (user: any) => {
    try {
      await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
    } catch {}
  },

  loadUser: async (): Promise<any | null> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
};
