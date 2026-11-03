import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { ConversationSummary, totalUnread } from '../utils/conversations';
import { logger } from '../utils/logger';

const REFRESH_INTERVAL_MS = 30_000;

interface MessagesContextValue {
  conversations: readonly ConversationSummary[];
  unread: number;
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
}

const MessagesContext = createContext<MessagesContextValue>({
  conversations: [],
  unread: 0,
  loading: false,
  failed: false,
  refresh: async () => {},
});

interface MessagesProviderProps {
  token: string | null;
  children: React.ReactNode;
}

/** Tiene aggiornato l'elenco delle conversazioni: lo leggono la pagina Messaggi, "I Miei" e il numero sulla barra in basso. */
export function MessagesProvider({ token, children }: MessagesProviderProps) {
  const [conversations, setConversations] = useState<readonly ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const data = await api.getConversations(current);
      if (tokenRef.current !== current) return; // nel frattempo l'utente è uscito o è cambiato
      setConversations(data);
      setFailed(false);
    } catch (error) {
      logger.debug('Error loading conversations:', error);
      if (tokenRef.current === current) setFailed(true);
    } finally {
      if (tokenRef.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setConversations([]);
      setFailed(false);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [token, refresh]);

  const value = useMemo(
    () => ({ conversations, unread: totalUnread(conversations), loading, failed, refresh }),
    [conversations, loading, failed, refresh]
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export const useMessages = (): MessagesContextValue => useContext(MessagesContext);
