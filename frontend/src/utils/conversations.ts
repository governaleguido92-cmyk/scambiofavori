export interface ConversationSummary {
  favor_id: string;
  favor_title: string;
  favor_status: string;
  other_user_id: string;
  other_user_name: string;
  last_message: {
    content: string;
    sender_id: string;
    message_type: string;
    created_at: string;
  };
  unread: number;
  can_write: boolean;
}

/** Messaggi non letti in tutte le conversazioni (per il numero sull'icona). */
export const totalUnread = (conversations: readonly ConversationSummary[]): number =>
  conversations.reduce((sum, conversation) => sum + conversation.unread, 0);

const pad = (n: number): string => String(n).padStart(2, '0');

/** "12:30" se è di oggi, "Ieri" se è di ieri, altrimenti "03/11". */
export const formatConversationTime = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (date.getTime() >= startOfToday) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getTime() >= startOfToday - dayMs) return 'Ieri';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
};

/** Anteprima dell'ultimo messaggio: i punti d'incontro non hanno un testo leggibile. */
export const previewText = (message: ConversationSummary['last_message'], mine: boolean, youLabel: string): string => {
  const body = message.message_type === 'meeting_point' ? '📍' : message.content;
  return mine ? `${youLabel}: ${body}` : body;
};

export type ConversationFilter = 'all' | 'unread' | 'closed';

/** Minuscolo e senza accenti, per cercare "perche" e trovare "perché". */
const normalize = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Applica la scheda scelta e il testo cercato (nome della persona o titolo del favore). */
export const filterConversations = (
  conversations: readonly ConversationSummary[],
  filter: ConversationFilter,
  query: string
): ConversationSummary[] => {
  const needle = normalize(query.trim());
  return conversations.filter((conversation) => {
    if (filter === 'unread' && conversation.unread === 0) return false;
    if (filter === 'closed' && conversation.can_write) return false;
    if (!needle) return true;
    return (
      normalize(conversation.other_user_name).includes(needle) ||
      normalize(conversation.favor_title).includes(needle)
    );
  });
};

/** Quante conversazioni hanno messaggi non letti, quante sono concluse (per i numeri sulle schede). */
export const filterCounts = (conversations: readonly ConversationSummary[]) => ({
  all: conversations.length,
  unread: conversations.filter((c) => c.unread > 0).length,
  closed: conversations.filter((c) => !c.can_write).length,
});
