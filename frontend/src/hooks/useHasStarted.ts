import { useAuth } from '../context/AuthContext';

/**
 * Ha già fatto il primo passo (pubblicato o accettato un favore)? Fino ad allora Quartiere, Messaggi e I Miei
 * restano chiusi. Se il server non manda ancora l'informazione (versione vecchia) l'app resta tutta aperta.
 */
export function useHasStarted(): boolean {
  const { user } = useAuth();
  return user?.has_started !== false;
}
