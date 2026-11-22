import {
  EMOJI_CATEGORIES,
  isEmojiOnlyMessage,
  loadRecentEmojis,
  recordRecentEmoji,
} from '../src/data/emojis';
import { TRANSLATIONS } from '../src/i18n/translations';
import {
  addPersonalStickerToSinglePhoneState,
  appendSinglePhoneStickerMessage,
  appendSinglePhoneTextMessage,
  createEmptySinglePhoneChatState,
  deleteSinglePhoneStickerFromState,
  loadSinglePhoneChatState,
  persistSinglePhoneChatState,
  saveOtherStickerToSinglePhoneState,
} from '../src/utils/singlePhoneChatStore';
import {
  computeHexSha256,
  computeScaledDimensions,
  StickerImageError,
  validateStickerFileMetadata,
} from '../src/utils/stickerImage';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertThrowsCode(fn: () => unknown, expectedCode: string, label: string): void {
  let caught: unknown = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof StickerImageError && caught.code === expectedCode, `${label}: expected ${expectedCode}`);
}

// Polyfill minimal localStorage for Node execution
const memStorage = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return memStorage.size;
  },
  clear() {
    memStorage.clear();
  },
  getItem(k: string) {
    return memStorage.get(k) ?? null;
  },
  key(index: number) {
    return Array.from(memStorage.keys())[index] ?? null;
  },
  removeItem(k: string) {
    memStorage.delete(k);
  },
  setItem(k: string, v: string) {
    memStorage.set(k, String(v));
  },
};

async function runTests(): Promise<void> {
  // 1. Sticker image format validation
  assert(validateStickerFileMetadata('image/png', 'a.png', 1024) === 'image/png', 'PNG MIME allowed');
  assert(validateStickerFileMetadata('image/webp', 'a.webp', 1024) === 'image/webp', 'WebP MIME allowed');
  assert(validateStickerFileMetadata('image/jpeg', 'a.jpg', 1024) === 'image/jpeg', 'JPEG MIME allowed');
  assert(validateStickerFileMetadata('', 'photo.JPEG', 1024) === 'image/jpeg', 'Extension fallback allowed');

  assertThrowsCode(
    () => validateStickerFileMetadata('image/gif', 'anim.gif', 1024),
    'UNSUPPORTED_FORMAT',
    'GIF rejected'
  );
  assertThrowsCode(
    () => validateStickerFileMetadata('image/svg+xml', 'vec.svg', 1024),
    'UNSUPPORTED_FORMAT',
    'SVG rejected'
  );
  assertThrowsCode(
    () => validateStickerFileMetadata('application/pdf', 'doc.pdf', 1024),
    'UNSUPPORTED_FORMAT',
    'PDF rejected'
  );
  assertThrowsCode(
    () => validateStickerFileMetadata('image/png', 'huge.png', 15 * 1024 * 1024),
    'FILE_TOO_LARGE',
    'Oversized image rejected'
  );

  // 2. Scaling & Content Hash
  const scaledLandscape = computeScaledDimensions(1920, 1080, 384);
  assert(scaledLandscape.width === 384 && scaledLandscape.height === 216, 'Landscape scales to 384x216');
  const scaledSmall = computeScaledDimensions(200, 150, 384);
  assert(scaledSmall.width === 200 && scaledSmall.height === 150, 'Small image keeps original size');
  const hash = await computeHexSha256(new Uint8Array([1, 2, 3, 4, 5]));
  assert(/^[a-zA-Z0-9_-]{8,128}$/.test(hash), `Hash matches Firestore rule format: ${hash}`);

  // 3. Emoji Categories (All 8 Required) & Recently Used & Large Emoji Detection
  const catIds = EMOJI_CATEGORIES.map((c) => c.id);
  const expectedCats = [
    'smileys',
    'laughing',
    'hearts',
    'celebrations',
    'animals',
    'food',
    'sports',
    'symbols',
  ];
  for (const cat of expectedCats) {
    assert(catIds.includes(cat as typeof catIds[number]), `Emoji category present: ${cat}`);
  }
  assert(EMOJI_CATEGORIES.every((c) => c.emojis.length >= 20), 'Every emoji category is well populated');

  recordRecentEmoji('😂');
  recordRecentEmoji('❤️');
  recordRecentEmoji('😂');
  const recent = loadRecentEmojis();
  assert(recent[0] === '😂' && recent[1] === '❤️' && recent.length === 2, 'Recent emojis deduplicated & ordered');

  assert(isEmojiOnlyMessage('😂'), 'Single emoji detected as emoji-only');
  assert(isEmojiOnlyMessage('😂😂❤️🔥'), 'Multiple emojis detected as emoji-only');
  assert(!isEmojiOnlyMessage('هلا 😂'), 'Arabic + emoji is regular text');
  assert(!isEmojiOnlyMessage('hello 😂'), 'English + emoji is regular text');

  // 4. Single Phone Offline Chat + Personal Stickers + Save From Others + Duplicate Prevention
  let spState = createEmptySinglePhoneChatState();
  const addA1 = addPersonalStickerToSinglePhoneState(spState, {
    playerId: 'sp-ahmed',
    playerName: 'أحمد',
    dataUrl: 'data:image/webp;base64,AAA111',
    contentHash: 'hash_abc12345',
  });
  assert(addA1.status === 'added', 'Player A first sticker added');
  spState = addA1.nextState;

  // Duplicate upload by Player A blocked
  const addA1Dup = addPersonalStickerToSinglePhoneState(spState, {
    playerId: 'sp-ahmed',
    playerName: 'أحمد',
    dataUrl: 'data:image/webp;base64,AAA111',
    contentHash: 'hash_abc12345',
  });
  assert(addA1Dup.status === 'already_exists', 'Duplicate personal sticker upload prevented');

  // Send sticker & multi-emoji messages in chat
  spState = appendSinglePhoneStickerMessage(spState, 'sp-ahmed', 'أحمد', addA1.sticker);
  spState = appendSinglePhoneTextMessage(spState, 'sp-omar', 'عمر', '😂😂🎉');
  assert(spState.messages.length === 2, 'Messages appended to Single Phone chat');

  // Player B (عمر) saves Player A's sticker -> keeps creatorName='أحمد', does NOT remove from A
  const saveB = saveOtherStickerToSinglePhoneState(spState, {
    targetPlayerId: 'sp-omar',
    stickerId: addA1.sticker.stickerId,
    imageUrl: addA1.sticker.imageUrl,
    contentHash: addA1.sticker.contentHash,
    creatorUid: addA1.sticker.creatorUid,
    creatorName: addA1.sticker.creatorName,
  });
  assert(saveB.status === 'saved', 'Player B saved Player A sticker');
  spState = saveB.nextState;

  const bStickers = spState.stickersByPlayer['sp-omar'] ?? [];
  const aStickers = spState.stickersByPlayer['sp-ahmed'] ?? [];
  assert(bStickers.length === 1 && bStickers[0].creatorName === 'أحمد', 'Saved sticker preserves original creator name');
  assert(bStickers[0].isSavedFromOther === true, 'Saved sticker marked isSavedFromOther=true');
  assert(aStickers.length === 1, 'Saving did NOT remove sticker from original owner');

  // Player B tries saving the exact same sticker again -> blocked
  const saveBDup = saveOtherStickerToSinglePhoneState(spState, {
    targetPlayerId: 'sp-omar',
    stickerId: addA1.sticker.stickerId,
    imageUrl: addA1.sticker.imageUrl,
    contentHash: addA1.sticker.contentHash,
    creatorUid: addA1.sticker.creatorUid,
    creatorName: addA1.sticker.creatorName,
  });
  assert(saveBDup.status === 'already_exists', 'Duplicate save from other player prevented');

  // Persist & Reload (simulates leaving & rejoining)
  assert(persistSinglePhoneChatState(spState), 'Single Phone state persisted cleanly');
  const reloaded = loadSinglePhoneChatState();
  assert(reloaded.messages.length === 2, 'Reloaded messages count matches');
  assert(reloaded.stickersByPlayer['sp-omar']?.length === 1, 'Reloaded personal stickers persisted');

  // Deleting from B does not affect A
  const afterDeleteB = deleteSinglePhoneStickerFromState(reloaded, 'sp-omar', addA1.sticker.stickerId);
  assert((afterDeleteB.stickersByPlayer['sp-omar'] ?? []).length === 0, 'B sticker deleted');
  assert((afterDeleteB.stickersByPlayer['sp-ahmed'] ?? []).length === 1, 'A sticker unaffected when B deletes');

  // 5. Translations key parity
  const arKeys = Object.keys(TRANSLATIONS.ar);
  const enKeys = Object.keys(TRANSLATIONS.en);
  for (const k of arKeys) {
    assert(enKeys.includes(k), `Translation key missing in en: ${k}`);
  }
  assert(TRANSLATIONS.en.addToMyStickersBtn === 'Add to My Stickers', 'Exact Add to My Stickers label');
  assert(TRANSLATIONS.en.myStickersTitle === 'My Stickers', 'Exact My Stickers label');
  assert(TRANSLATIONS.en.addStickerBtn === 'Add Sticker', 'Exact Add Sticker label');

  console.log('ALL STICKERS & EMOJIS VERIFICATION TESTS PASSED (100%)');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
