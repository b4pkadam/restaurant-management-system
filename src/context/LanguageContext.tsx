import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AppSettings } from '../types';
import { settingsDB, subscribeDb } from '../database/db';

export type AppLanguage = 'en' | 'es' | 'fr' | 'hi';

export interface LanguageOption {
  code: AppLanguage;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
];

const translations: Record<AppLanguage, Record<string, string>> = {
  en: {
    // Navigation
    dashboard: 'Dashboard',
    pos: 'POS / Billing',
    orders: 'Orders',
    kitchen: 'Kitchen Display',
    tables: 'Tables',
    menu: 'Menu',
    inventory: 'Inventory',
    suppliers: 'Suppliers',
    employees: 'Employees',
    reports: 'Reports',
    users: 'Users',
    settings: 'Settings',

    // Common Actions
    save: 'Save',
    saveChanges: 'Save Changes',
    saved: 'Saved',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    uploadPhoto: 'Upload Photo',
    changePhoto: 'Change Photo',
    removeLogo: 'Remove',
    preview: 'Preview',
    active: 'Active',
    inactive: 'Inactive',
    connected: 'Connected',
    connecting: 'Connecting...',
    offline: 'Offline',
    logOut: 'Log Out',

    // Settings Sections
    restaurantProfile: 'Restaurant Profile',
    restaurantName: 'Restaurant Name',
    address: 'Address',
    phone: 'Phone',
    gstNumber: 'GST Number',
    taxPercentage: 'Tax Percentage (%)',
    currency: 'Region & Currency',
    currencySymbol: 'Currency Symbol',
    appearance: 'Appearance & Language',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    autoBackup: 'Enable Automatic Backups',
    backupInterval: 'Backup Interval (hours)',
    callingAlerts: 'Customer Calling Alert',
    ringtone: 'Ringtone Chime',
    vibration: 'Physical Vibration on Tablets & Phones',
    cloudSync: 'Cloud Synchronization',
    cloudActive: 'Real-Time Cloud Sync Active',
    cloudConnecting: 'Connecting to Cloud...',
    cloudOffline: 'Local Offline Mode',
    syncNow: 'Sync Now',
    uploadToCloud: 'Upload Local Data to Cloud',
    dataManagement: 'Data Management',
    downloadBackup: 'Download Backup',
    restoreBackup: 'Restore Backup',
    logoActive: 'Logo Active',
    defaultIcon: 'Default Icon',
  },
  es: {
    // Navigation
    dashboard: 'Panel de Control',
    pos: 'TPV / Facturación',
    orders: 'Pedidos',
    kitchen: 'Cocina',
    tables: 'Mesas',
    menu: 'Menú',
    inventory: 'Inventario',
    suppliers: 'Proveedores',
    employees: 'Empleados',
    reports: 'Informes',
    users: 'Usuarios',
    settings: 'Configuración',

    // Common Actions
    save: 'Guardar',
    saveChanges: 'Guardar Cambios',
    saved: 'Guardado',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    search: 'Buscar',
    uploadPhoto: 'Subir Foto',
    changePhoto: 'Cambiar Foto',
    removeLogo: 'Eliminar',
    preview: 'Vista Previa',
    active: 'Activo',
    inactive: 'Inactivo',
    connected: 'Conectado',
    connecting: 'Conectando...',
    offline: 'Desconectado',
    logOut: 'Cerrar Sesión',

    // Settings Sections
    restaurantProfile: 'Perfil del Restaurante',
    restaurantName: 'Nombre del Restaurante',
    address: 'Dirección',
    phone: 'Teléfono',
    gstNumber: 'Número de Impuestos / NIF',
    taxPercentage: 'Porcentaje de Impuestos (%)',
    currency: 'Región y Moneda',
    currencySymbol: 'Símbolo de Moneda',
    appearance: 'Apariencia e Idioma',
    theme: 'Tema',
    light: 'Claro',
    dark: 'Oscuro',
    language: 'Idioma',
    autoBackup: 'Habilitar Copias Automáticas',
    backupInterval: 'Intervalo de Copia (horas)',
    callingAlerts: 'Alerta de Llamada del Cliente',
    ringtone: 'Tono de Llamada',
    vibration: 'Vibración en Móviles y Tabletas',
    cloudSync: 'Sincronización en la Nube',
    cloudActive: 'Sincronización en Tiempo Real Activa',
    cloudConnecting: 'Conectando a la nube...',
    cloudOffline: 'Modo Local Desconectado',
    syncNow: 'Sincronizar Ahora',
    uploadToCloud: 'Subir Datos Locales a la Nube',
    dataManagement: 'Gestión de Datos',
    downloadBackup: 'Descargar Copia',
    restoreBackup: 'Restaurar Copia',
    logoActive: 'Logo Activo',
    defaultIcon: 'Icono Predeterminado',
  },
  fr: {
    // Navigation
    dashboard: 'Tableau de bord',
    pos: 'Caisse / Facturation',
    orders: 'Commandes',
    kitchen: 'Cuisine',
    tables: 'Tables',
    menu: 'Menu',
    inventory: 'Inventaire',
    suppliers: 'Fournisseurs',
    employees: 'Personnel',
    reports: 'Rapports',
    users: 'Utilisateurs',
    settings: 'Paramètres',

    // Common Actions
    save: 'Enregistrer',
    saveChanges: 'Enregistrer les Modifications',
    saved: 'Enregistré',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    search: 'Rechercher',
    uploadPhoto: 'Télécharger Photo',
    changePhoto: 'Changer Photo',
    removeLogo: 'Supprimer',
    preview: 'Aperçu',
    active: 'Actif',
    inactive: 'Inactif',
    connected: 'Connecté',
    connecting: 'Connexion...',
    offline: 'Hors ligne',
    logOut: 'Déconnexion',

    // Settings Sections
    restaurantProfile: 'Profil du Restaurant',
    restaurantName: 'Nom du Restaurant',
    address: 'Adresse',
    phone: 'Téléphone',
    gstNumber: 'Numéro de TVA / SIRET',
    taxPercentage: 'Pourcentage de Taxe (%)',
    currency: 'Région et Devise',
    currencySymbol: 'Symbole de Devise',
    appearance: 'Apparence et Langue',
    theme: 'Thème',
    light: 'Clair',
    dark: 'Sombre',
    language: 'Langue',
    autoBackup: 'Activer la Sauvegarde Auto',
    backupInterval: 'Intervalle de Sauvegarde (heures)',
    callingAlerts: 'Alerte Appel Client',
    ringtone: 'Sonnerie de Carillon',
    vibration: 'Vibration Tactile sur Tablettes',
    cloudSync: 'Synchronisation Cloud',
    cloudActive: 'Synchronisation Cloud Active',
    cloudConnecting: 'Connexion au Cloud...',
    cloudOffline: 'Mode Local Hors Ligne',
    syncNow: 'Synchroniser',
    uploadToCloud: 'Envoyer les Données au Cloud',
    dataManagement: 'Gestion des Données',
    downloadBackup: 'Télécharger Sauvegarde',
    restoreBackup: 'Restaurer Sauvegarde',
    logoActive: 'Logo Actif',
    defaultIcon: 'Icône par Défaut',
  },
  hi: {
    // Navigation
    dashboard: 'डैशबोर्ड',
    pos: 'पीओएस / बिलिंग',
    orders: 'ऑर्डर्स',
    kitchen: 'किचन डिस्प्ले',
    tables: 'टेबल्स',
    menu: 'मेनू',
    inventory: 'इन्वेंट्री',
    suppliers: 'आपूर्तिकर्ता',
    employees: 'कर्मचारी',
    reports: 'रिपोर्ट्स',
    users: 'उपयोगकर्ता',
    settings: 'सेटिंग्स',

    // Common Actions
    save: 'सहेजें',
    saveChanges: 'परिवर्तन सहेजें',
    saved: 'सहेजा गया',
    cancel: 'रद्द करें',
    delete: 'हटाएं',
    edit: 'संपादित करें',
    search: 'खोजें',
    uploadPhoto: 'फ़ोटो अपलोड करें',
    changePhoto: 'फ़ोटो बदलें',
    removeLogo: 'हटाएं',
    preview: 'पूर्वावलोकन',
    active: 'सक्रिय',
    inactive: 'निष्क्रिय',
    connected: 'कनेक्टेड',
    connecting: 'कनेक्ट हो रहा है...',
    offline: 'ऑफ़लाइन',
    logOut: 'लॉग आउट',

    // Settings Sections
    restaurantProfile: 'रेस्टोरेंट प्रोफ़ाइल',
    restaurantName: 'रेस्टोरेंट का नाम',
    address: 'पता',
    phone: 'फ़ोन नंबर',
    gstNumber: 'जीएसटी नंबर',
    taxPercentage: 'टैक्स प्रतिशत (%)',
    currency: 'क्षेत्र और मुद्रा',
    currencySymbol: 'मुद्रा प्रतीक',
    appearance: 'दिखावट और भाषा',
    theme: 'थीम',
    light: 'लाइट',
    dark: 'डार्क',
    language: 'भाषा',
    autoBackup: 'स्वचालित बैकअप सक्षम करें',
    backupInterval: 'बैकअप अंतराल (घंटे)',
    callingAlerts: 'ग्राहक कॉलिंग अलर्ट',
    ringtone: 'रिंगटोन रिंग / घंटी',
    vibration: 'मोबाइल और टैबलेट पर कंपन (वाइब्रेशन)',
    cloudSync: 'क्लाउड सिंक (सिंक्रोनाइज़ेशन)',
    cloudActive: 'रीयल-टाइम क्लाउड सिंक सक्रिय है',
    cloudConnecting: 'क्लाउड से कनेक्ट हो रहा है...',
    cloudOffline: 'स्थानीय ऑफ़लाइन मोड',
    syncNow: 'अभी सिंक करें',
    uploadToCloud: 'स्थानीय डेटा क्लाउड पर भेजें',
    dataManagement: 'डेटा प्रबंधन',
    downloadBackup: 'बैकअप डाउनलोड करें',
    restoreBackup: 'बैकअप पुनर्स्थापित करें',
    logoActive: 'लोगो सक्रिय है',
    defaultIcon: 'डिफ़ॉल्ट आइकन',
  },
};

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      const current = settingsDB.get();
      return (current?.language as AppLanguage) || 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    const unsub = subscribeDb(() => {
      const latest = settingsDB.get()?.language as AppLanguage;
      if (latest && latest !== language) {
        setLanguageState(latest);
      }
    });
    return unsub;
  }, [language]);

  const setLanguage = (newLang: AppLanguage) => {
    setLanguageState(newLang);
    settingsDB.update({ language: newLang });
  };

  const t = (key: string, fallback?: string): string => {
    const dict = translations[language] || translations.en;
    if (dict && dict[key]) {
      return dict[key];
    }
    const enDict = translations.en;
    if (enDict && enDict[key]) {
      return enDict[key];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
