import { tt, tx } from '../i18n/tt';

/** Frasi da toccare sotto la descrizione: aiutano a scrivere un annuncio chiaro. */
const GENERIC_PROMPTS = ['Quando: ', 'Dove: '];
const CATEGORY_PROMPTS: Record<string, string[]> = {
  'Spesa': ['Cosa comprare: ', 'Dove fare la spesa: '],
  'Trasporto': ['Partenza e arrivo: ', 'Quante persone: '],
  'Tecnologia': ['Che dispositivo: ', 'Qual è il problema: '],
  'Pulizie': ['Quanti locali: ', 'Prodotti disponibili: '],
  'Compagnia': ['Cosa vi piacerebbe fare: '],
  'Cucina': ['Per quante persone: ', 'Ingredienti: '],
  'Giardinaggio': ['Attrezzi disponibili: ', 'Grandezza dello spazio: '],
  'Babysitting': ['Età dei bambini: ', 'Per quante ore: '],
  'Animali': ['Che animale: ', 'Abitudini e orari: '],
  'Ripetizioni': ['Materia e livello: ', 'In presenza o online: '],
  'Consiglio': ['Cosa vorresti sapere: '],
  'Informazione': ['Cosa ti serve sapere: '],
  'Aiuto Rapido': ['Di cosa hai bisogno: '],
  'Altro': ['Di cosa hai bisogno: '],
};

/** Ore tipiche per categoria (si va di ora in ora). */
const SUGGESTED_HOURS: Record<string, number> = {
  'Pulizie': 2,
  'Cucina': 2,
  'Giardinaggio': 2,
  'Babysitting': 3,
};
const DEFAULT_HOURS = 1;

const GENERIC_TIPS = [
  'Incontratevi in un luogo pubblico la prima volta.',
  'Scambiate telefono ed email solo in chat, quando vi fidate.',
];
const CATEGORY_TIPS: Record<string, string> = {
  'Babysitting': 'Conoscetevi prima di lasciare i bambini e parlate di orari e regole.',
  'Animali': 'Chiarite prima cosa fare se l\'animale sta male.',
  'Spesa': 'Per le medicine scrivi solo l\'essenziale: niente dati sulla tua salute.',
  'Trasporto': 'Accordatevi su partenza, arrivo e orario prima di partire.',
  'Tecnologia': 'Non dare mai password, codici o PIN a nessuno.',
  'Pulizie': 'Se qualcuno entra in casa tua, stabilite prima orari e stanze.',
  'Giardinaggio': 'Se qualcuno entra in casa tua, stabilite prima orari e spazi.',
  'Cucina': 'Se qualcuno entra in casa tua, stabilite prima orari e stanze.',
};

export const getDescriptionPrompts = (category: string): string[] => {
  const specific = CATEGORY_PROMPTS[category] ?? CATEGORY_PROMPTS['Altro'];
  return [...specific, ...GENERIC_PROMPTS].map((prompt) => tt(prompt));
};

export const getSuggestedHours = (category: string): number => SUGGESTED_HOURS[category] ?? DEFAULT_HOURS;

export const getSafetyTips = (category: string): string[] => {
  const specific = CATEGORY_TIPS[category];
  return [...(specific ? [specific] : []), ...GENERIC_TIPS].slice(0, 3).map((tip) => tt(tip));
};

/** Aggiunge una frase guida alla descrizione, su una nuova riga, senza ripeterla né superare il massimo. */
export const appendPrompt = (description: string, prompt: string, max: number): string => {
  if (description.includes(prompt.trim())) return description;
  const separator = description.length === 0 || description.endsWith('\n') ? '' : '\n';
  const next = `${description}${separator}${prompt}`;
  return next.length > max ? description : next;
};

export interface PublishNote {
  id: 'empty_prompts' | 'short' | 'when' | 'phone_or_email' | 'address';
  text: string;
}

const TIME_HINT =
  /\b(oggi|domani|dopodomani|stasera|stanotte|mattina|pomeriggio|sera|weekend|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|settimana|ore|alle|entro)\b|\d{1,2}[:.]\d{2}/i;
const PHONE = /(?:\+?\d[\s.-]?){9,}/;
const EMAIL = /\S+@\S+\.\S+/;
const ADDRESS = /\b(via|viale|piazza|corso|largo|vicolo)\s+[\p{L}' ]+?\s*,?\s*\d+/iu;
const EMPTY_PROMPT_LINE = /^[^:\n]{2,40}:\s*$/;
const SHORT_DESCRIPTION_CHARS = 25;
const MIN_CHARS_TO_ASK_WHEN = 10;

/** Avvisi non bloccanti prima di pubblicare: cosa manca o cosa è meglio non scrivere nel testo. */
export const checkBeforePublish = (title: string, description: string): PublishNote[] => {
  const notes: PublishNote[] = [];
  const lines = description.split('\n');
  // Le frasi guida toccate ma non completate ("Quando:") non contano come testo scritto
  const unanswered = lines.map((line) => line.trim()).filter((line) => EMPTY_PROMPT_LINE.test(line));
  const content = lines.filter((line) => !EMPTY_PROMPT_LINE.test(line.trim())).join('\n');
  const text = `${title} ${content}`;
  const body = content.trim();

  if (unanswered.length > 0) {
    const names = unanswered.map((line) => line.replace(/:\s*$/, '')).join(', ');
    notes.push({ id: 'empty_prompts', text: tx('Hai lasciato senza risposta: {0}. Completa o cancella queste righe.', [names]) });
  }

  if (PHONE.test(text) || EMAIL.test(text)) {
    notes.push({ id: 'phone_or_email', text: tt('Sembra che tu abbia scritto un telefono o un\'email: nel testo li vedono tutti. Tienili per la chat.') });
  }
  if (ADDRESS.test(text)) {
    notes.push({ id: 'address', text: tt('Hai scritto un indirizzo preciso: gli altri lo vedono. Meglio dirlo in chat quando vi accordate.') });
  }
  if (body.length > 0 && body.length < SHORT_DESCRIPTION_CHARS) {
    notes.push({ id: 'short', text: tt('Descrivi un po\' di più: poche righe aiutano chi legge a capire se può aiutarti.') });
  }
  if (body.length >= MIN_CHARS_TO_ASK_WHEN && !TIME_HINT.test(text)) {
    notes.push({ id: 'when', text: tt('Non hai scritto quando: aggiungi un giorno o un orario.') });
  }
  return notes;
};
