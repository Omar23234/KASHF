# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Room Identity**: A room document ID must be a 6-character uppercase alphanumeric code (`^[A-Z0-9]{6}$`) matching `roomCode`, created only by an authenticated user setting `hostId == request.auth.uid`, `status == 'waiting'`, and `playerOrder == [request.auth.uid]`.
2. **No Room Scraping**: Collection `list` queries on `/rooms` and `/rooms/{roomId}/players` are strictly denied (`allow list: if false`). Players access rooms exclusively by exact 6-character room code lookup.
3. **Player Capacity & Membership**: `playerOrder` is strictly bounded to `<= 12` UIDs, and starting a game requires `>= 2` players. A player document `/rooms/{roomId}/players/{playerId}` can only be created for `request.auth.uid` while the parent room status is `'waiting'`.
4. **Independent 3-Skip Quota**: Every player initializes with `skipsRemaining == 3` and `skipsUsed == 0`. Only the current `activePlayerId` may decrement their own `skipsRemaining` by 1, and ONLY atomically alongside incrementing the room's `turnNonce` and `skippedQuestionsCount` (`getAfter` / `get` lock). A 4th skip (`skipsRemaining < 1`) is rejected by Firestore rules.
5. **Turn Race Protection**: Every Next Question or Skip transition must increment `turnNonce` by exactly 1 and can only be executed by `activePlayerId` (or `hostId` on Next Question for inactive/disconnected player recovery).
6. **Question Non-Repetition**: Every new `currentQuestionId` must be an integer `1..63` that is NOT already in `existing().usedQuestionIds`, and `usedQuestionIds` is bounded to `<= 63`.
7. **Terminal State Lock**: Once a room reaches `status == 'closed'`, no further updates are permitted.
8. **Server Temporal Integrity**: `createdAt`, `updatedAt`, `joinedAt`, and `lastSeenAt` must equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Ghost Field Shadow Create**: Create `/rooms/ABC234` with extra `isAdmin: true` field -> `PERMISSION_DENIED`.
2. **Host Spoofing on Create**: Create `/rooms/ABC234` with `hostId: 'victim-uid'` -> `PERMISSION_DENIED`.
3. **Oversized Room Code ID Poisoning**: Create `/rooms/AAAA...1500chars` -> `PERMISSION_DENIED`.
4. **Fourth Skip Bypass**: Update `/rooms/ABC234/players/p1` with `skipsRemaining: -1` when `skipsRemaining == 0` -> `PERMISSION_DENIED`.
5. **Non-Atomic Skip**: Update `/rooms/ABC234/players/p1` (`skipsRemaining: 2`) without updating `/rooms/ABC234` (`turnNonce + 1`) in the same transaction -> `PERMISSION_DENIED`.
6. **Stealing Another Player's Turn**: Non-active non-host player attempts `Next Question` -> `PERMISSION_DENIED`.
7. **Host Stealing a Player's Skip**: Host attempts to trigger `Skip` during another player's turn -> `PERMISSION_DENIED`.
8. **Duplicate Question Injection**: Active player sets `currentQuestionId` to an ID already in `usedQuestionIds` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Update `/rooms/ABC234` with backdated `updatedAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Joining Full or Active Room**: Player attempts to join a room with `status == 'playing'` or `playerCount == 12` -> `PERMISSION_DENIED`.
11. **Room List Scraping**: Client executes `getDocs(collection(db, 'rooms'))` -> `PERMISSION_DENIED`.
12. **Closed Room Mutation**: Any user attempts to update a room after `status == 'closed'` -> `PERMISSION_DENIED`.
