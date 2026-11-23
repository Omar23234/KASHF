# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Room Identity**: A room document ID must be a 6-character uppercase alphanumeric code (`^[A-Z0-9]{6}$`) matching `roomCode`, created only by an authenticated user setting `hostId == request.auth.uid`, `status == 'waiting'`, and `playerOrder == [request.auth.uid]`.
2. **No Room Scraping**: Collection `list` queries on `/rooms` and `/rooms/{roomId}/players` are strictly denied (`allow list: if false`). Players access rooms exclusively by exact 6-character room code lookup.
3. **Player Capacity & Membership**: `playerOrder` is strictly bounded to `<= 12` UIDs, and starting a game requires `>= 2` players. A player document `/rooms/{roomId}/players/{playerId}` can only be created for `request.auth.uid` while the parent room status is `'waiting'`.
4. **Scoring & 3-Skip Penalty**:
   - Answering a question adds `+1` to the answering player's `score` (`-1000..1000`, negative scores explicitly allowed).
   - Normal Skip deducts `-3` from the skipping player's `score` and decrements `skipsRemaining` (`0..3`). A 4th skip is denied (`skipsRemaining < 1`).
   - On the 3rd skip (`skipsUsed == 3`), `pendingDoubleTurn` becomes `true` (if `!doublePenaltyUsed`), giving two consecutive different questions on their next turn, applied only once (`doublePenaltyUsed` locked to `true`).
5. **5-Card Game Cap & Inventory Ownership**:
   - `availableSpecialCards` + `awardedCardIds` never exceeds 5 unique IDs (`gold_1`, `gold_2`, `switch_1`, `switch_2`, `anti_switch_1`).
   - Card rewards never consume items from `usedQuestionIds`.
   - Gold Card (`goldCards >= 1`, `turnMode == 'normal'`): owner only, `0` score change, consumes 1 Gold Card.
   - Switch Card (`switchCards >= 1`, `turnMode == 'normal'`): owner only, target must be another room player (`target != uid`), consumes 1 Switch Card, sets `turnMode = 'switch_pending'`.
   - Anti-Switch Card (`antiSwitchCards >= 1`, `turnMode == 'switch_pending'`, `switchTargetId == uid`): target owner only, consumes 1 Anti-Switch Card, sets `turnMode = 'anti_switch_forced'` returning question to `switchSourceId` who cannot skip or Gold Card out.
6. **Turn Race Protection & Question Non-Repetition**: Every turn or card transition increments `turnNonce` by 1. Every drawn `currentQuestionId` is an integer `1..63` not previously in `usedQuestionIds`.
7. **Room-Scoped Text, Sticker, Voice & Reaction Chat + Ephemeral Voice Signaling**:
   - `/rooms/{roomId}/messages/{messageId}` can only be created by room members (`isRoomMember(roomId)`) with `senderId == request.auth.uid`, optional reply reference fields (`replyToMessageId`, `replyToSenderName`, `replyToPreviewText`, `replyToType`), and either text (1..500 chars), sticker metadata (`https://` Firebase Storage URL), or voice message metadata (`audioUrl` `https://` Storage URL, `audioDurationSec` 1..300s, `audioMimeType` `audio/*`). `data:` and `blob:` URIs are strictly rejected; reads require `request.auth.uid in resource.data.memberIds` (or `isRoomMember` on `get`).
   - `/rooms/{roomId}/messageReactions/{reactionId}` requires deterministic ID `{messageId}_{uid}`, `userId == request.auth.uid`, allowed reaction emoji (`❤️`, `😂`, `😮`, `😢`, `👍`, `👎`), and allows updates/deletes exclusively by the reaction owner (`existing().userId == request.auth.uid`).
   - `/playerStickers/{playerId}/items/{stickerId}` is strictly isolated to `playerId == request.auth.uid && ownerId == request.auth.uid`, preserving `creatorUid`/`creatorName` and requiring an `https://` Storage URL (never `data:` URIs).
   - `/rooms/{roomId}/voiceSignals/{signalId}` stores only SDP/ICE strings (never audio), writable only by room members with `fromUid == request.auth.uid` and readable/deletable only by `fromUid` or `toUid`.
8. **Terminal State Lock & Server Temporal Integrity**: Closed rooms deny updates. Timestamps (`createdAt`, `updatedAt`, `joinedAt`, `lastSeenAt`) must equal `request.time`.

## 2. Adversarial Payloads Matrix
1. **Ghost Field Shadow Create**: Create `/rooms/ABC234` with extra `isAdmin: true` field -> `PERMISSION_DENIED`.
2. **Host Spoofing on Create**: Create `/rooms/ABC234` with `hostId: 'victim-uid'` -> `PERMISSION_DENIED`.
3. **Oversized Room Code ID Poisoning**: Create `/rooms/AAAA...1500chars` -> `PERMISSION_DENIED`.
4. **Fourth Skip Bypass**: Update `/rooms/ABC234/players/p1` with `skipsRemaining: -1` when `skipsRemaining == 0` -> `PERMISSION_DENIED`.
5. **Non-Atomic Skip Without Turn Advance**: Update `/rooms/ABC234/players/p1` (`skipsRemaining: 2`) without updating `/rooms/ABC234` (`turnNonce + 1`) -> `PERMISSION_DENIED`.
6. **Stealing Another Player's Turn**: Non-active non-host player attempts `Next Question` -> `PERMISSION_DENIED`.
7. **Host Stealing a Player's Skip**: Host attempts to trigger `Skip` during another player's turn -> `PERMISSION_DENIED`.
8. **Duplicate Question Injection**: Active player sets `currentQuestionId` to an ID already in `usedQuestionIds` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Update `/rooms/ABC234` with backdated `updatedAt != request.time` -> `PERMISSION_DENIED`.
10. **Joining Active or Full Room**: Player joins a room with `status == 'playing'` or `playerCount == 12` -> `PERMISSION_DENIED`.
11. **Room List Scraping**: Client executes `getDocs(collection(db, 'rooms'))` -> `PERMISSION_DENIED`.
12. **Closed Room Mutation**: Any user updates a room after `status == 'closed'` -> `PERMISSION_DENIED`.
13. **Arbitrary Score Inflation**: Player updates their own `score` to `+999` outside an atomic turn transaction -> `PERMISSION_DENIED`.
14. **Self-Targeting Switch Card**: Active player sets `switchTargetId == request.auth.uid` -> `PERMISSION_DENIED`.
15. **Refusing Anti-Switch Forced Turn**: Player under `turnMode == 'anti_switch_forced'` attempts `Skip` or `Gold Card` -> `PERMISSION_DENIED`.
16. **Unauthorized Chat Read/Write**: Non-member creates or queries `/rooms/ABC234/messages` -> `PERMISSION_DENIED`.
17. **Voice Signal Spoofing**: User writes `/rooms/ABC234/voiceSignals` with `fromUid != request.auth.uid` -> `PERMISSION_DENIED`.
18. **Raw Image / Base64 Data-URI Injection in Firestore**: User submits `imageUrl: 'data:image/png;base64,...'` to `/playerStickers` or `/messages` -> `PERMISSION_DENIED`.
19. **Cross-Owner Sticker Collection Read/Write**: User attempts to read or write `/playerStickers/other-uid/items/s1` -> `PERMISSION_DENIED`.
20. **Forged Reaction Owner or Non-Deterministic ID**: User writes `/rooms/ABC234/messageReactions/m1_victim` with `userId != request.auth.uid` -> `PERMISSION_DENIED`.
21. **Deleting Another Player Reaction**: User attempts to delete `/rooms/ABC234/messageReactions/m1_other` -> `PERMISSION_DENIED`.
22. **Invalid Reaction Emoji Injection**: User writes arbitrary text as reaction `emoji` outside allowed reaction list -> `PERMISSION_DENIED`.
23. **Blob or Data URI Audio Injection**: User sends `messageType: 'voice'` with `audioUrl: 'blob:...'` or `'data:audio/webm;...'` -> `PERMISSION_DENIED`.
