import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import firebaseAppletConfig from '../../firebase-applet-config.json';

interface ResolvedFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId?: string;
}

const resolvedConfig: ResolvedFirebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || firebaseAppletConfig.apiKey || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || firebaseAppletConfig.authDomain || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || firebaseAppletConfig.projectId || '',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || firebaseAppletConfig.storageBucket || '',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() ||
    firebaseAppletConfig.messagingSenderId ||
    '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || firebaseAppletConfig.appId || '',
  firestoreDatabaseId:
    process.env.EXPO_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID?.trim() ||
    firebaseAppletConfig.firestoreDatabaseId ||
    '',
};

function isValidValue(val: string | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('MY_') || trimmed.startsWith('YOUR_') || trimmed === 'remixed-project-id') {
    return false;
  }
  return true;
}

export const isFirebaseConfigured: boolean =
  isValidValue(resolvedConfig.apiKey) &&
  isValidValue(resolvedConfig.authDomain) &&
  isValidValue(resolvedConfig.projectId) &&
  isValidValue(resolvedConfig.appId);

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let initError: string | null = null;

if (isFirebaseConfigured) {
  try {
    appInstance = getApps().length > 0 ? getApps()[0] : initializeApp(resolvedConfig);

    try {
      // Use AsyncStorage persistence when supported by Firebase Auth React Native bundle
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authModule = require('firebase/auth') as {
        getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
      };
      if (typeof authModule.getReactNativePersistence === 'function') {
        authInstance = initializeAuth(appInstance, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          persistence: authModule.getReactNativePersistence(AsyncStorage) as any,
        });
      } else {
        authInstance = getAuth(appInstance);
      }
    } catch {
      authInstance = getAuth(appInstance);
    }

    dbInstance = resolvedConfig.firestoreDatabaseId
      ? getFirestore(appInstance, resolvedConfig.firestoreDatabaseId)
      : getFirestore(appInstance);
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
    authInstance = null;
    dbInstance = null;
  }
} else {
  initError = 'FIREBASE_CONFIG_MISSING';
}

export const firebaseApp = appInstance;
export const auth = authInstance;
export const db = dbInstance;
export const firebaseInitError = initError;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = authInstance?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;
export async function testConnection(): Promise<void> {
  if (connectionTested || !dbInstance) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore connection offline — check Firebase configuration.');
    }
  }
}
