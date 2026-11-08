import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import colors from '../src/theme/colors';
import { BrandLogo } from '../src/components/BrandLogo';
import { goBackOrHome } from '../src/utils/navigation';

export default function LegalScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrHome(router)}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <BrandLogo />
        </View>
        <Text style={styles.headerTitle}>Note Legali</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Terms of Service */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text" size={24} color={colors.lime} />
            <Text style={styles.sectionTitle}>Termini di Servizio</Text>
          </View>
          
          <View style={styles.article}>
            <Text style={styles.articleTitle}>1. Natura della Piattaforma</Text>
            <Text style={styles.articleText}>
              &quot;Scambio Favori&quot; è una piattaforma che facilita lo scambio di favori tra privati cittadini. 
              L&apos;app agisce esclusivamente come intermediario tecnologico e non partecipa in alcun modo 
              agli accordi tra gli utenti.
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>2. Esonero di Responsabilità</Text>
            <Text style={styles.articleText}>
              La piattaforma non è responsabile per:{'\n'}
              • Danni diretti o indiretti derivanti dallo scambio di favori{'\n'}
              • Infortuni o incidenti durante l&apos;esecuzione di un favore{'\n'}
              • Qualità, tempestività o completezza delle prestazioni{'\n'}
              • Comportamenti degli utenti al di fuori della piattaforma{'\n\n'}
              Ogni scambio avviene sotto la piena responsabilità degli utenti coinvolti.
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>3. Divieto di Scambio di Denaro</Text>
            <Text style={styles.articleText}>
              È severamente vietato richiedere, offrire o scambiare denaro reale (contanti, bonifici, 
              pagamenti elettronici) in cambio di favori.{'\n\n'}
              Gli scambi avvengono esclusivamente tramite la valuta virtuale &quot;Granelli&quot;.{'\n\n'}
              <Text style={styles.warningText}>
                La violazione di questa regola comporta il ban permanente dalla piattaforma.
              </Text>
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>4. Obblighi dell&apos;Utente</Text>
            <Text style={styles.articleText}>
              L&apos;utente si impegna a:{'\n'}
              • Fornire informazioni veritiere al momento della registrazione{'\n'}
              • Comportarsi con rispetto e correttezza verso gli altri utenti{'\n'}
              • Non utilizzare la piattaforma per attività illegali{'\n'}
              • Rispettare gli accordi presi con altri utenti{'\n'}
              • Non pubblicare contenuti offensivi o inappropriati
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>5. Sospensione e Terminazione</Text>
            <Text style={styles.articleText}>
              La piattaforma si riserva il diritto di sospendere o terminare l&apos;account di utenti che:{'\n'}
              • Violano i presenti Termini di Servizio{'\n'}
              • Ricevono ripetute segnalazioni negative{'\n'}
              • Tentano di eludere il sistema di valuta virtuale{'\n'}
              • Mettono in pericolo la sicurezza di altri utenti
            </Text>
          </View>
        </View>

        {/* Privacy Policy */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark" size={24} color={colors.lime} />
            <Text style={styles.sectionTitle}>Privacy Policy</Text>
          </View>
          
          <View style={styles.gdprBadge}>
            <Text style={styles.gdprBadgeText}>Conforme al GDPR (Regolamento UE 2016/679)</Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>1. Dati Raccolti</Text>
            <Text style={styles.articleText}>
              Raccogliamo i seguenti dati:{'\n'}
              • <Text style={styles.bold}>Dati di registrazione:</Text> email, nome, password (conservata solo cifrata) e data di nascita, usata solo per verificare che tu sia maggiorenne (conserviamo soltanto l&apos;anno di nascita, che nessun altro vede); con l&apos;accesso tramite Google o Apple, nome ed email forniti dal servizio{'\n'}
              • <Text style={styles.bold}>Dati di localizzazione:</Text> posizione del dispositivo (solo su consenso); chi crea un favore lo vede nel punto esatto, gli altri solo in una posizione approssimata; per completare un favore non serve: ci si incontra di persona e chi riceve mostra un codice QR che chi aiuta scansiona con la fotocamera (l&apos;immagine non viene salvata){'\n'}
              • <Text style={styles.bold}>Profilo:</Text> foto profilo (se la carichi), competenze, punteggi e badge{'\n'}
              • <Text style={styles.bold}>Profilo pubblico:</Text> gli altri utenti possono aprire il tuo profilo per conoscerti: nome, foto, la presentazione «Chi sono» che scrivi tu (max 200 caratteri, puoi cambiarla o toglierla), titolo, mese di iscrizione, telefono e identità verificati, garanzie ricevute (solo il numero), favori dati e ricevuti, voto medio, puntualità, competenze, badge e le ultime 5 recensioni con il nome di chi le ha scritte. Mai email, telefono, data di nascita, posizione, saldo o segnalazioni. Chi blocchi non lo vede{'\n'}
              • <Text style={styles.bold}>Il Nostro Quartiere:</Text> i messaggi che scrivi nella chat tra chi ha un favore attivo entro 15 km, con il tuo nome; vengono cancellati dopo 2 giorni; gli avvisi che pubblichi restano 3 giorni; tutto sparisce quando elimini l&apos;account{'\n'}
              • <Text style={styles.bold}>Eventi e presentazioni del quartiere:</Text> gli eventi che organizzi (titolo, luogo generico, giorno e ora) restano visibili entro 15 km fino a poche ore dopo l&apos;inizio; la presentazione che scrivi resta 14 giorni; chi risponde &quot;Ci vado&quot; o ti dà il benvenuto compare solo come numero; i ringraziamenti pubblici mostrano il tuo nome e quello della persona ringraziata{'\n'}
              • <Text style={styles.bold}>Moderazione:</Text> le segnalazioni sono lette solo dal titolare e dai moderatori abilitati, che vedono il testo segnalato e i nomi, mai email o telefono; le loro azioni restano registrate e il titolare riceve un avviso per email per gli allarmi di sicurezza{'\n'}
              • <Text style={styles.bold}>Dati di utilizzo:</Text> favori creati, messaggi, notifiche, recensioni, elenco degli utenti che blocchi e quando hai aperto l&apos;ultima volta ogni chat (per i messaggi non letti){'\n'}
              • <Text style={styles.bold}>Fiducia e sicurezza:</Text> il tuo livello di fiducia è calcolato da dati che abbiamo già; conserviamo le garanzie che dai o ricevi (gli altri vedono solo il numero), la percentuale di favori che annulli dopo l&apos;accettazione e le segnalazioni di sicurezza (chi segnala, chi è segnalato, favore, data, testo facoltativo). Se più persone segnalano lo stesso utente, l&apos;account può essere messo in revisione. I messaggi fermati dai filtri non vengono consegnati ma sono conservati con il testo originale per la moderazione{'\n'}
              • <Text style={styles.bold}>Telefono:</Text> se verifichi il numero (alla registrazione, per tenere fuori account falsi e truffatori) lo usiamo solo per inviarti un SMS con un codice; non lo conserviamo, teniamo solo un&apos;impronta cifrata e le ultime 4 cifre. Gli altri vedono soltanto il segno &quot;Telefono verificato&quot;{'\n'}
              • <Text style={styles.bold}>Notifiche push:</Text> un identificativo del dispositivo, se le attivi{'\n'}
              • <Text style={styles.bold}>Pagamenti:</Text> il contributo opzionale è gestito da Stripe; non conserviamo il numero della carta{'\n'}
              • <Text style={styles.bold}>Dati tecnici:</Text> indirizzo IP e registri del server, per sicurezza
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>2. Utilizzo dei Dati GPS</Text>
            <Text style={styles.articleText}>
              La posizione GPS viene utilizzata esclusivamente per:{'\n'}
              • Mostrare favori nelle vicinanze{'\n'}
              • Calcolare la distanza approssimativa tra utenti{'\n'}
              • Verificare la prossimità per il completamento dei favori{'\n\n'}
              <Text style={styles.highlightText}>
                La tua posizione esatta non viene mai mostrata pubblicamente. 
                Utilizziamo un raggio approssimativo per proteggere la tua privacy.
              </Text>
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>3. Conservazione dei Dati</Text>
            <Text style={styles.articleText}>
              I tuoi dati vengono conservati:{'\n'}
              • Per tutta la durata dell&apos;account{'\n'}
              • Segnalazioni di sicurezza, garanzie e messaggi fermati dai filtri: finché mantieni l&apos;account o finché servono a verificare un abuso{'\n'}
              • Dopo la cancellazione dell&apos;account i dati personali vengono eliminati subito, come descritto qui sotto{'\n'}
              • I dati dei pagamenti per il periodo richiesto dalla normativa fiscale e contabile
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>4. I Tuoi Diritti (GDPR)</Text>
            <Text style={styles.articleText}>
              Hai il diritto di:{'\n'}
              • <Text style={styles.bold}>Accesso:</Text> richiedere copia dei tuoi dati{'\n'}
              • <Text style={styles.bold}>Rettifica:</Text> correggere dati inesatti{'\n'}
              • <Text style={styles.bold}>Cancellazione:</Text> eliminare il tuo account e tutti i dati{'\n'}
              • <Text style={styles.bold}>Portabilità:</Text> ricevere i tuoi dati in formato leggibile{'\n'}
              • <Text style={styles.bold}>Opposizione:</Text> opporti al trattamento per marketing
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>5. Diritto all&apos;Oblio</Text>
            <Text style={styles.articleText}>
              Puoi eliminare il tuo account in qualsiasi momento da Profilo → Elimina account. 
              Verranno cancellati subito:{'\n'}
              • Email, nome, password e dati del profilo{'\n'}
              • La foto profilo{'\n'}
              • Messaggi inviati e notifiche{'\n'}
              • Impronta del telefono, richieste di codici SMS, stato di lettura delle chat ed elenco dei blocchi{'\n'}
              • Garanzie date e ricevute e segnalazioni fatte nei tuoi confronti (quelle che hai inviato restano, senza collegamento con te){'\n'}
              • Granelli accumulati{'\n\n'}
              I favori che hai creato vengono eliminati insieme a tutti i messaggi scambiati in quelle chat, 
              alle recensioni e ai ringraziamenti collegati. Le recensioni che hai scritto restano in forma 
              anonima (&quot;Utente eliminato&quot;); quelle che hai ricevuto vengono cancellate. I dati dei 
              pagamenti sono conservati per gli obblighi di legge. Se non riesci ad accedere all&apos;app, scrivi all&apos;indirizzo 
              indicato nei contatti.
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>6. Sicurezza</Text>
            <Text style={styles.articleText}>
              Adottiamo misure di sicurezza per proteggere i tuoi dati:{'\n'}
              • Password conservate solo in forma cifrata{'\n'}
              • Connessioni HTTPS cifrate{'\n'}
              • Accesso ai dati limitato a chi ne ha bisogno
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>7. Fornitori e trasferimenti</Text>
            <Text style={styles.articleText}>
              Non vendiamo i tuoi dati. Usiamo fornitori che li trattano per nostro conto: Render (hosting), 
              MongoDB Atlas (database), Cloudflare R2 (foto profilo), Resend (email di verifica), Stripe 
              (pagamenti), Twilio (SMS con il codice di verifica del telefono), Expo (notifiche push) e, se li scegli, Google o Apple per l&apos;accesso. Alcuni possono 
              trattare dati anche fuori dall&apos;Unione Europea, con le garanzie previste dal GDPR. L&apos;app non 
              contiene pubblicità.
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>8. Minori</Text>
            <Text style={styles.articleText}>
              L&apos;app è destinata a persone di almeno 18 anni.
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>9. Titolare e contatti</Text>
            <Text style={styles.articleText}>
              Titolare del trattamento: Guido Governale.{'\n'}
              Per qualsiasi domanda sulla privacy o per esercitare i tuoi diritti scrivi a:{'\n\n'}
              <Text
                style={styles.emailText}
                onPress={() => Linking.openURL('mailto:infoapp@scambiofavori.it')}
                accessibilityRole="link"
              >
                infoapp@scambiofavori.it
              </Text>
              {'\n\n'}Informativa completa:{'\n'}
              <Text
                style={styles.emailText}
                onPress={() => Linking.openURL('https://scambiofavori.it/privacy')}
                accessibilityRole="link"
              >
                scambiofavori.it/privacy
              </Text>
            </Text>
          </View>
        </View>

        {/* Last Update */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Ultimo aggiornamento: 4 novembre 2026
          </Text>
          <Text style={styles.footerText}>
            Versione: 1.1
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  gdprBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 20,
  },
  gdprBadgeText: {
    color: colors.lime,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  article: {
    marginBottom: 24,
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  articleText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  warningText: {
    color: colors.error,
    fontWeight: '600',
  },
  highlightText: {
    color: colors.lime,
    fontStyle: 'italic',
  },
  emailText: {
    color: colors.accent,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
