import { serverDate } from './serverDate';

export type DayKind = 'today' | 'yesterday' | 'date';

export interface DayBucket {
  kind: DayKind;
  date: Date;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Identifica il giorno di calendario locale: due messaggi con la stessa chiave sono dello stesso giorno. */
export const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "Oggi", "Ieri" o una data, rispetto al giorno corrente. */
export const dayBucket = (value: string | Date, now: Date = new Date()): DayBucket => {
  const date = new Date(value);
  const today = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const key = dayKey(date);
  if (key === today) return { kind: 'today', date };
  if (key === dayKey(yesterday)) return { kind: 'yesterday', date };
  return { kind: 'date', date };
};

export type ChatRow<M> =
  | { type: 'day'; key: string; bucket: DayBucket }
  | { type: 'message'; key: string; message: M };

/** Intercala un separatore di giorno prima del primo messaggio di ogni giorno. I messaggi con data non valida restano senza separatore. */
export const buildRows = <M extends { message_id: string; created_at: string }>(
  messages: M[],
  now: Date = new Date()
): ChatRow<M>[] => {
  const rows: ChatRow<M>[] = [];
  let lastKey: string | null = null;
  for (const message of messages) {
    const date = serverDate(message.created_at);
    if (!Number.isNaN(date.getTime())) {
      const key = dayKey(date);
      if (key !== lastKey) {
        rows.push({ type: 'day', key: `day_${key}`, bucket: dayBucket(date, now) });
        lastKey = key;
      }
    }
    rows.push({ type: 'message', key: message.message_id, message });
  }
  return rows;
};
