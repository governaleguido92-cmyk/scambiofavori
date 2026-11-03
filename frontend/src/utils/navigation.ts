import type { useRouter } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

/** Torna alla pagina precedente; se non c'è (pagina aperta direttamente o ricaricata) va alla Home. */
export const goBackOrHome = (router: AppRouter): void => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)' as never);
  }
};
