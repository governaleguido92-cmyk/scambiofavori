# 🚀 Build per Simulatore iOS con Xcode

## Prerequisiti
- macOS con Xcode installato (almeno versione 14)
- Node.js (versione 18+)
- yarn o npm

## Istruzioni Passo-Passo

### 1. Scarica e Estrai il ZIP
Scarica `scambio-di-favori-frontend.zip` e estrailo in una cartella.

### 2. Apri il Terminale
Apri il Terminale e naviga nella cartella estratta:
```bash
cd ~/Downloads/scambio-di-favori-frontend
```
(o dovunque hai estratto il file)

### 3. Installa le Dipendenze
```bash
yarn install
```
oppure
```bash
npm install
```

### 4. Avvia la Build per Simulatore iOS
```bash
npx expo run:ios
```

Questo comando:
- Genera il progetto iOS nativo nella cartella `ios/`
- Compila l'app con Xcode
- Avvia il simulatore iOS
- Installa e lancia l'app

### 5. (Alternativa) Build con EAS
Se vuoi usare EAS Build per creare un file .app:
```bash
npx eas-cli build --profile simulator --platform ios --local
```

## Configurazione Backend
L'app è già configurata per connettersi al backend:
```
https://hyperlocal-hub-8.preview.emergentagent.com
```

## Troubleshooting

### "Command not found: expo"
```bash
npm install -g expo-cli eas-cli
```

### Errore di Pods
```bash
cd ios && pod install && cd ..
```

### Reset Completo
```bash
rm -rf node_modules ios android
yarn install
npx expo run:ios
```

## Account di Test
- **Email**: reviewer@test.com
- **Password**: review123
