import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { logger } from '../utils/logger';
import { notify } from '../utils/notify';
import { tt } from '../i18n/tt';

const PICKER_OPTIONS = { allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.8 };

/** Scegliere o scattare la foto del profilo e caricarla. `onUploaded` serve ad aggiornare i dati dopo il caricamento. */
export function useProfilePhoto(token: string | null, onUploaded: () => Promise<void> | void) {
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const upload = async (uri: string) => {
    if (!token) return;
    setProfileImage(uri);
    setUploadingImage(true);
    try {
      await api.uploadProfilePicture(uri, token);
      await onUploaded();
      notify(tt('Successo'), tt('Foto profilo aggiornata!'));
    } catch (error) {
      logger.debug('Error uploading image:', error);
      notify(tt('Errore'), tt('Impossibile caricare la foto. Riprova.'));
      setProfileImage(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const fromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      notify(tt('Permesso negato'), tt('È necessario il permesso per usare la fotocamera.'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    if (!result.canceled && result.assets[0]) await upload(result.assets[0].uri);
  };

  const fromLibrary = async () => {
    // Su Android il selettore di sistema non chiede permessi (READ_MEDIA_IMAGES non è dichiarato).
    if (Platform.OS !== 'android') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        notify(tt('Permesso negato'), tt('È necessario il permesso per accedere alla libreria foto.'));
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], ...PICKER_OPTIONS });
    if (!result.canceled && result.assets[0]) await upload(result.assets[0].uri);
  };

  const pickImage = () => {
    Alert.alert(tt('Foto Profilo'), tt('Come vuoi aggiungere la foto?'), [
      { text: tt('Scatta Foto'), onPress: fromCamera },
      { text: tt('Scegli dalla Libreria'), onPress: fromLibrary },
      { text: tt('Annulla'), style: 'cancel' },
    ]);
  };

  return { profileImage, uploadingImage, pickImage };
}
