import type { TRANSLATIONS } from '../i18n/translations';

export type TranslationDict = (typeof TRANSLATIONS)['ar'] | (typeof TRANSLATIONS)['en'];

function extractNestedErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (!raw) return '';
  if (raw.startsWith('{') && raw.includes('"error"')) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown };
      if (typeof parsed.error === 'string') return parsed.error;
    } catch {
      // fall back to raw message
    }
  }
  return raw;
}

export function formatMultiplayerError(err: unknown, t: TranslationDict): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = (err as { code?: string })?.code ?? '';
  const nested = extractNestedErrorText(err);
  const combined = `${code} ${raw} ${nested}`.toLowerCase();

  switch (raw) {
    case 'FIREBASE_NOT_CONFIGURED':
      return t.firebaseNotConfiguredTitle;
    case 'INVALID_NAME':
      return t.errEnterName;
    case 'INVALID_CODE':
      return t.errInvalidCode;
    case 'ROOM_NOT_FOUND':
      return t.errRoomNotFound;
    case 'ROOM_STARTED':
      return t.errRoomStarted;
    case 'ROOM_FULL':
      return t.errRoomFull;
    case 'ROOM_CLOSED':
      return t.errRoomClosed;
    case 'NOT_YOUR_TURN':
    case 'NOT_SWITCH_TARGET':
      return t.errNotYourTurn;
    case 'NO_SKIPS_LEFT':
      return t.noSkipsLeft;
    case 'CANNOT_REFUSE_FORCED_TURN':
      return t.cannotRefuseHint;
    case 'VOICE_STORAGE_UNAVAILABLE':
      return t.voiceStorageUnavailable;
    case 'VOICE_UPLOAD_FAILED':
      return t.voiceUploadFailed;
    case 'VOICE_TOO_LARGE':
      return t.voiceTooLong;
    case 'AUTH_REQUIRED':
      return t.anonAuthRequiredTitle;
    case 'MIN_PLAYERS_REQUIRED':
      return t.minPlayersWarning;
    case 'HOST_ONLY':
      return t.errPermissionDenied;
    case 'KICKED_FROM_ROOM':
      return t.errKickedFromRoom;
    default:
      break;
  }

  if (
    combined.includes('permission-denied') ||
    combined.includes('permission_denied') ||
    combined.includes('missing or insufficient permissions')
  ) {
    return t.errPermissionDenied;
  }

  if (
    combined.includes('network') ||
    combined.includes('offline') ||
    combined.includes('unavailable') ||
    combined.includes('failed to fetch') ||
    combined.includes('deadline-exceeded')
  ) {
    return t.errNetwork;
  }

  if (combined.includes('operation-not-allowed') || combined.includes('admin-restricted-operation')) {
    return t.anonAuthRequiredTitle;
  }

  return t.errGeneric;
}
