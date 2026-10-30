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

export default function LegalScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
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
            <Ionicons name="document-text" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Termini di Servizio</Text>
          </View>
          
          <View style={styles.article}>
            <Text style={styles.articleTitle}>1. Natura della Piattaforma</Text>
            <Text style={styles.articleText}>
              "Scambio di Favori" è una piattaforma che facilita lo scambio di favori tra privati cittadini. 
              L'app agisce esclusivamente come intermediario tecnologico e non partecipa in alcun modo 
              agli accordi tra gli utenti.
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>2. Esonero di Responsabilità</Text>
            <Text style={styles.articleText}>
              La piattaforma non è responsabile per:{'\n'}
              • Danni diretti o indiretti derivanti dallo scambio di favori{'\n'}
              • Infortuni o incidenti durante l'esecuzione di un favore{'\n'}
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
              Gli scambi avvengono esclusivamente tramite la valuta virtuale "Granelli" (🌾).{'\n\n'}
              <Text style={styles.warningText}>
                La violazione di questa regola comporta il ban permanente dalla piattaforma.
              </Text>
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>4. Obblighi dell'Utente</Text>
            <Text style={styles.articleText}>
              L'utente si impegna a:{'\n'}
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
              La piattaforma si riserva il diritto di sospendere o terminare l'account di utenti che:{'\n'}
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
            <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Privacy Policy</Text>
          </View>
          
          <View style={styles.gdprBadge}>
            <Text style={styles.gdprBadgeText}>Conforme al GDPR (Regolamento UE 2016/679)</Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>1. Dati Raccolti</Text>
            <Text style={styles.articleText}>
              Raccogliamo i seguenti dati:{'\n'}
              • <Text style={styles.bold}>Dati di registrazione:</Text> email, nome, password (conservata solo cifrata); con l'accesso tramite Google o Apple, nome ed email forniti dal servizio (l'accesso con Google passa dal servizio di autenticazione di Emergent){'\n'}
              • <Text style={styles.bold}>Dati di localizzazione:</Text> posizione del dispositivo (solo su consenso){'\n'}
              • <Text style={styles.bold}>Profilo:</Text> foto profilo (se la carichi), competenze, punteggi e badge{'\n'}
              • <Text style={styles.bold}>Dati di utilizzo:</Text> favori creati, messaggi, notifiche, recensioni{'\n'}
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
              • Per tutta la durata dell'account{'\n'}
              • Dopo la cancellazione dell'account i dati personali vengono eliminati subito, come descritto qui sotto{'\n'}
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
            <Text style={styles.articleTitle}>5. Diritto all'Oblio</Text>
            <Text style={styles.articleText}>
              Puoi eliminare il tuo account in qualsiasi momento da Profilo → Elimina account. 
              Verranno cancellati subito:{'\n'}
              • Email, nome, password e dati del profilo{'\n'}
              • La foto profilo{'\n'}
              • Messaggi inviati e notifiche{'\n'}
              • Granelli accumulati{'\n\n'}
              I favori e le recensioni che hai scritto restano per lo storico degli altri utenti, ma senza 
              i tuoi dati personali (il tuo nome diventa "Utente eliminato"). I dati dei pagamenti sono 
              conservati per gli obblighi di legge. Se non riesci ad accedere all'app, scrivi all'indirizzo 
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
              (pagamenti), Expo (notifiche push), Emergent (autenticazione per l'accesso con Google) e, se li scegli, Google o Apple per l'accesso. Alcuni possono 
              trattare dati anche fuori dall'Unione Europea, con le garanzie previste dal GDPR. L'app non 
              contiene pubblicità.
            </Text>
          </View>

          <View style={styles.article}>
            <Text style={styles.articleTitle}>8. Minori</Text>
            <Text style={styles.articleText}>
              L'app è destinata a persone di almeno 18 anni.
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
            Ultimo aggiornamento: Ottobre 2026
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
    color: colors.primary,
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
    color: colors.primary,
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
