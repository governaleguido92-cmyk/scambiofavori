/** "1 Granello", "2 Granelli": il nome della valuta cambia al singolare. */
export const granelliWord = (count: number): string => (count === 1 ? 'Granello' : 'Granelli');

/** "1 Granello", "6 Granelli". */
export const formatGranelli = (count: number): string => `${count} ${granelliWord(count)}`;
