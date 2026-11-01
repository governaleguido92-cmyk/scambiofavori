import i18n from '../i18n';

interface Example {
  it: string;
  en: string;
}

/** Titoli di esempio per categoria: toccandoli si riempie il campo titolo. */
const EXAMPLES: Record<string, Example[]> = {
  'Trasporto': [
    { it: 'Passaggio in auto', en: 'Ride in the car' },
    { it: 'Accompagno in stazione', en: 'Lift to the station' },
    { it: 'Portare un pacco', en: 'Deliver a parcel' },
  ],
  'Spesa': [
    { it: 'Spesa al mercato', en: 'Market shopping' },
    { it: 'Spesa al supermercato', en: 'Supermarket shopping' },
    { it: 'Ritirare le medicine', en: 'Pick up medicines' },
  ],
  'Tecnologia': [
    { it: 'Aiuto con lo smartphone', en: 'Help with a smartphone' },
    { it: 'Sistemare il computer', en: 'Fix a computer' },
    { it: 'Configurare la TV', en: 'Set up the TV' },
  ],
  'Pulizie': [
    { it: 'Pulizie di casa', en: 'House cleaning' },
    { it: 'Dopo un trasloco', en: 'After a move' },
    { it: 'Pulire il balcone', en: 'Clean the balcony' },
  ],
  'Compagnia': [
    { it: 'Una chiacchierata in compagnia', en: 'A friendly chat' },
    { it: 'Passeggiata insieme', en: 'A walk together' },
    { it: 'Leggere un libro insieme', en: 'Read a book together' },
  ],
  'Cucina': [
    { it: 'Cucinare un pranzo', en: 'Cook a lunch' },
    { it: 'Insegnare una ricetta', en: 'Teach a recipe' },
    { it: 'Preparare una torta', en: 'Bake a cake' },
  ],
  'Giardinaggio': [
    { it: 'Annaffiare le piante', en: 'Water the plants' },
    { it: 'Potare la siepe', en: 'Trim the hedge' },
    { it: 'Sistemare l\'orto', en: 'Tidy the vegetable garden' },
  ],
  'Babysitting': [
    { it: 'Babysitter per una sera', en: 'Babysitter for an evening' },
    { it: 'Andare a prendere i bimbi a scuola', en: 'Pick the kids up from school' },
    { it: 'Aiuto con i compiti', en: 'Help with homework' },
  ],
  'Animali': [
    { it: 'Passeggiata con il cane', en: 'Walk the dog' },
    { it: 'Dare da mangiare al gatto', en: 'Feed the cat' },
    { it: 'Accompagnare dal veterinario', en: 'Go with you to the vet' },
  ],
  'Ripetizioni': [
    { it: 'Ripetizioni di matematica', en: 'Maths tutoring' },
    { it: 'Ripetizioni di inglese', en: 'English tutoring' },
    { it: 'Aiuto per un esame', en: 'Help with an exam' },
  ],
  'Consiglio': [
    { it: 'Un consiglio su un acquisto', en: 'Advice on a purchase' },
    { it: 'Un parere su un lavoretto', en: 'An opinion on a small job' },
    { it: 'Aiuto con un documento', en: 'Help with a document' },
  ],
  'Informazione': [
    { it: 'Informazioni sul quartiere', en: 'Information about the area' },
    { it: 'Come funziona una pratica', en: 'How a procedure works' },
    { it: 'Dove trovare un servizio', en: 'Where to find a service' },
  ],
  'Aiuto Rapido': [
    { it: 'Una mano veloce', en: 'A quick hand' },
    { it: 'Prestare un attrezzo', en: 'Lend a tool' },
    { it: 'Cambiare una lampadina', en: 'Change a light bulb' },
  ],
  'Altro': [
    { it: 'Un aiuto per una piccola faccenda', en: 'Help with a small task' },
    { it: 'Montare un mobile', en: 'Assemble a piece of furniture' },
    { it: 'Un lavoretto in casa', en: 'A little job at home' },
  ],
};

/** I titoli di esempio per la categoria, nella lingua dell'app. Vuoto se la categoria non ha esempi. */
export const getTitleExamples = (category: string): string[] => {
  const english = i18n.language === 'en';
  return (EXAMPLES[category] ?? []).map((example) => (english ? example.en : example.it));
};
