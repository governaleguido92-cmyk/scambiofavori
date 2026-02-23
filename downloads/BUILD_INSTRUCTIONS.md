# Scambio di Favori - Build Instructions

## 📱 Come Creare la Build Android APK

### Prerequisiti
- Node.js 18+ installato
- Yarn installato (`npm install -g yarn`)
- EAS CLI installato (`npm install -g eas-cli`)

### Passaggi

1. **Estrai lo ZIP** in una cartella

2. **Apri il terminale** nella cartella estratta

3. **Installa le dipendenze:**
```bash
yarn install
```

4. **Esporta il token Expo:**
```bash
export EXPO_TOKEN="r4-_d7d37WouNJBFc9ERsh9r3k6OlvL3umbuAqIk"
```

Su Windows PowerShell:
```powershell
$env:EXPO_TOKEN="r4-_d7d37WouNJBFc9ERsh9r3k6OlvL3umbuAqIk"
```

5. **Avvia la build:**
```bash
eas build --platform android --profile preview
```

6. **Quando ti chiede "Generate a new Android Keystore?":**
   - Rispondi **Y** (Yes)

7. **Attendi ~15 minuti**
   La build verrà eseguita sui server Expo

8. **Scarica l'APK:**
   - Vai su: https://expo.dev/accounts/domenico2026/projects/scambio-di-favori/builds
   - Clicca sulla build completata
   - Scarica l'APK

### Build iOS (richiede Mac + Apple Developer Account)
```bash
eas build --platform ios --profile preview
```

---

## 🔗 Backend URL
L'app è configurata per usare:
```
https://hyperlocal-hub-8.preview.emergentagent.com
```

## 📧 Supporto
Account Expo: domenico2026
Progetto: https://expo.dev/accounts/domenico2026/projects/scambio-di-favori
