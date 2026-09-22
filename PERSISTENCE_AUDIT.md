# Persistence-layer audit (read-only)

Scope: `src/utils/storage/*`, `src/utils/schema.ts`, `src/store/{competitionHistory,useTournamentStore,actions/*}.ts`,
`src/hooks/{useStorageSync,useWriterLock}.ts`. Nothing was modified except this report.

## HIGH

### H1. Undo/redo history is wiped on every reload (load path writes empty history over the restored one)
- `src/store/competitionHistory.ts:92-98`
  ```ts
  rawSet(nextPartial);
  if (options.history === 'replace' && options.persist !== false) {
    queueMicrotask(persistCurrentHistory);
  }
  ```
- `src/store/actions/competitionActions.ts:41-49`
  ```ts
  { history: 'replace', allowReadOnly: true, persist: false }   // <- saves competition only
  ...
  const history = await loadCompetitionHistory(saved.id);
  if (history) set({ historyPast: history.past, historyFuture: history.future });
  ```
Trigger: refresh the page with a non-empty undo stack. `set(..., {history:'replace'})` runs with the store's *current*
stacks (`[]` at boot) and `get()` is evaluated later inside `persistCurrentHistory`; `persist:false` deactivates the
guard that was meant to protect this case, so a microtask writes `{past:[], future:[]}` under the freshly loaded
competition id. `loadCompetitionHistory(saved.id)` then reads back the empty envelope (its own queue guarantees the
write lands first). `HistoryManager.tsx:68-70` advertises "Persisted in local storage and available after refresh" —
that promise is broken; every reload loses all undo/redo. `competitionHistory.test.ts:99` only tests the low-level
store, never the load path, so CI is green.
Fix: `if (options.history === 'replace' && options.persist !== false) queueMicrotask(persistCurrentHistory);`
→ keep as-is but **call `persistCurrentHistory` after** the history has been restored in `loadSavedCompetition`
(e.g. a `restoreHistory(past, future)` store action that sets both stacks and persists once).

### H2. IndexedDB-present-but-unusable + full localStorage ⇒ a stale backup silently replaces the user's work
- `src/utils/storage/storage.ts:249-265` (unchanged mirror survives a failed write) and `:326-355` (stale record wins)
  ```ts
  if (!isIndexedDbAvailable() || rawSize <= LOCAL_MIRROR_LIMIT_BYTES) {   // 249
    try { localStorage.setItem(STORAGE_KEY, serialized); localStorage.setItem(BACKUP_KEY, serialized); ... }
    catch (error) { localError = error; }                                  // 255-257: nothing removed
  }
  ```
  ```ts
  candidates.sort((a, b) => (timestamp(b.savedAt) - timestamp(a.savedAt)) || sourcePriority[...]); // 348
  const parsed = candidates[0];                                                                   // 353
  ```
Trigger: IndexedDB is exposed but every `indexedDB.open` rejects (Safari/Firefox private mode, storage disabled,
Firefox "storage is broken" transient error, blocked upgrade, corrupted profile) and the tournament is < 2 MB, so the
mirror is still written. The localStorage quota is or becomes exhausted (`QuotaExceededError` on `setItem`, either
call — the first failing `setItem` aborts the `try`, so the *other* key keeps its previous content). No new record is
written, but the old `BACKUP_KEY` payload is still sitting in localStorage with its **old** `savedAt`. On reload the
mirror is the only readable source, and `loadCompetition` sorts by `savedAt` so the stale backup is promoted as "the
newest record" (`restoredFromBackup` ⇒ relabels it as a recovery and re-saves it). The user's edits since the last
successful mirror write are gone with zero error surface — `persistCompetitionEnvelope` reports `ok` whenever
`indexedDbSaved === true` (`storage.ts:198-201`), and when IDB read fails the app just warns.
Fix: on write failure, `localStorage.removeItem(BACKUP_KEY)` (or write the backup with a version/generation marker and
refuse to load a backup whose generation is older than the last successful save), and warn the user whenever
`loadCompetition` promotes a record older than the last `savedAt` the app itself persisted.

### H3. Mirror deletion before the queued IDB write opens a both-stores-empty window
- `src/utils/storage/storage.ts:258-265`
  ```ts
  } else {
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(BACKUP_KEY); } catch {}
  }
  ```
  followed by `writeQueue = writeQueue...then(... idbSet ...)` (268-281) — asynchronous.
Trigger: tournament grows past `LOCAL_MIRROR_LIMIT_BYTES` (2 MB **raw**, pre-compression, `estimateDataSize` at line
240 does not subtract `compressCompetition`'s ~30 %). Both localStorage copies are deleted synchronously; the only
remaining copy is the queued `idbSet`. If the tab is closed/ crashes inside that window (also: `openDatabase` slow,
`onblocked`, quota abort), `loadCompetition` finds no candidate and returns `null` → both slots empty, tournament gone
silently. Note there is **no** `beforeunload`/`pagehide` flush anywhere (`flushStorage` is only called by
`health.repairStorageHealth`), so the queue is never drained on unload.
Fix: keep (don't delete) the mirror until the IDB write has actually committed, or flush the queue on `pagehide`
(`navigator.locks.request`/synchronous best-effort), or treat ≥2 MB as "compress and mirror anyway".

### H4. `flushStorage()`/`idbSet` resolve on request success, not transaction commit
- `src/utils/storage/indexedDb.ts:51-58`
  ```ts
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(...);
  transaction.onabort = () => reject(...);   // promise already resolved → no-op
  ```
Trigger: quota hit / storage pressure during commit aborts the transaction *after* `request.onsuccess`. `idbSet`
resolves, `persistCompetitionEnvelope` sets `indexedDbSaved = true`, `lastSavedAt` and the cross-tab broadcast are
published, and `StorageBanner` stays green — but nothing was committed. Combined with H3 (mirror already deleted),
the save is lost while the UI claims success.
Fix: resolve on `transaction.oncomplete` (and clear the handlers on the request only for `onerror`), so abort/commit
failures actually propagate.

## MEDIUM

### M1. Undo/redo history survives import / reset / snapshot-restore and can resurrect another tournament
- `src/store/actions/competitionActions.ts:53-74` (`importCompetition` / `resetCompetition` use `{label}` = "record"),
  `src/store/actions/snapshotActions.ts:40-45` (same).
- `src/store/competitionHistory.ts:57-63` stamps the envelope with `state.competition.id` while `past` still holds
  entries whose `entry.competition.id` is the *previous* competition; `historyStore.ts:38-57` only checks the envelope
  id, never that each entry belongs to it.
Trigger: have tournament A with history → import B (or Reset, or restore a snapshot). History is not cleared; the
pending snapshot of A is pushed and persisted under B's id. After a refresh, "undo"/"Restore before" jumps the store
back to A's snapshot, and the next save writes A's data under whatever id is active — a cross-tournament resurrection.
Fix: use `{ history: 'replace' }` in `importCompetition`, `resetCompetition` and `restoreFromSnapshot`; additionally
have `parseEnvelope` reject entries whose `competition.id !== envelope.competitionId`.

### M2. Invalid/rejected persisted record ⇒ silent factory reset, no user notice
- `src/utils/storage/storage.ts:227-236` + `335`: on validation failure `prepareStoredCompetition` returns `null`
  (`console.warn` only), and if every candidate is rejected `loadCompetition()` returns `null`; the app then shows a
  brand-new "新建赛事". Nothing calls `notifyStorageStatus` on this path (unlike `storageRestored`).
Trigger: all four records fail validation — e.g. a legacy v1 record whose players lack `playedAgainst`/`winRate`, a
group with an empty `tiebreakRules: []` array (schema demands non-empty unique rules), a `status`/`gameType` value the
enum set doesn't know, `playedAgainst` pointing at a player who was deleted in an older build, or an exported file
hand-edited. The whole tournament disappears instead of showing "your saved data is invalid".
Fix: on any rejected candidate call `notifyStorageStatus('error', {key:'storageSaveFailed', params:{message}})` with
the validation message, and keep the raw rejected payload under a quarantine key so it can be re-imported.

### M3. Snapshot read/modify/write is not serialized and not validated
- `src/utils/storage/snapshot.ts:57-82` / `97-107`: `saveSnapshot` does `existing = await listSnapshots()` then writes
  the whole array; `deleteSnapshot` (119-122) likewise. Reads/writes bypass `writeQueue` (they use `idbSet` directly).
- `listSnapshots` (31-50) casts IndexedDB/localStorage content with `as Snapshot[]` — no schema check.
Trigger: two `saveSnapshot` calls in the same tick (round-completion fired from `updateMatchResult`
`useTournamentStore.ts:497-505`, or a manual backup taken while an automatic one is in flight) both read the same
`existing` and the second write drops the first. A corrupted/legacy snapshot is then handed to `restoreFromSnapshot`
(`snapshotActions.ts:25-38`), which dereferences `group.players`, `group.matches`, `group.gameType` on it before any
validation → possible render crash. Conversely, if corrupted records live in IDB, `listSnapshots` returns them and the
good localStorage copy is never consulted (no fallback on "invalid").
Fix: give snapshots their own serial queue, validate each entry (`isHistoryEntry`-style guard incl.
`data.groups`/`players`/`matches`), and fall back to the other store when the IDB array fails validation.

### M4. Without Web Locks every tab is a writer; the lock is also not enforced inside the storage layer
- `src/hooks/useWriterLock.ts:10-13` — `if (!('locks' in navigator) || !navigator.locks) { setReadOnly(false); return; }`
  (plus `.catch(() => setReadOnly(true))` at line 40 as the only failure fallback).
- `src/utils/storage/storage.ts:239` `saveCompetition` has no lock/generation check; the only guard is `state.isReadOnly`
  in `createStoreSet` (`competitionHistory.ts:112`), which is UI state.
Trigger (a): Safari < 15.4 / any browser without `navigator.locks` → `isReadOnly` is false in *every* tab, so two tabs
play concurrently and the last `saveCompetition` wins; `useStorageSync` only detects a clash within 2 s
(`storageSync.isConcurrentSave`, threshold `2000`) and its conflict banner can itself be shown in both tabs.
Trigger (b): between mount and the deferred first `navigator.locks.request` (`setTimeout(acquire, 0)`, line 45) a tab
has `isReadOnly === false` while it does not own the lock; a very fast edit in that window writes outside the lock.
Trigger (c): `keepLocalVersion` (`useStorageSync.ts:47-51`) re-saves unconditionally, and a read-only tab still runs
`loadSavedCompetition` (`allowReadOnly: true`), so "which record is authoritative" is never arbitrated by the lock.
Fix: gate `saveCompetition` on lock ownership (pass a token/epoch, refuse writes when not the writer), start with
`isReadOnly = true` until the first lock attempt resolves, and treat "no Web Locks" as writer-lock-less mode with an
explicit user warning instead of silently enabling concurrent writers.

### M5. Legacy (format 3) groups bypass `migrateGroup`, so older records are dropped instead of migrated
- `src/utils/storage/storage.ts:121-144` builds the legacy group by hand and reports `version: 1`, so
  `migrateCompetitionData` runs migrations 1..4; `migrations[2]` is the only one that calls `migrateGroup`
  (`migrations.ts:28-31`, `75-104`), which is where `playedAgainst: []`, `downMatchCount`, etc. are defaulted.
  `migrations[1]` (20-26) only touches `currentGroupIndex`/`createdAt`.
Trigger: a pre-`groups` localStorage record whose players predate `playedAgainst`/`winRate` → `validateGroup`
(`schema.ts:186`, `180-185`) rejects it, `prepareStoredCompetition` returns `null`, and (M2) the user silently gets an
empty new tournament; the legacy data itself is left untouched but unreachable from the UI.
Fix: run `migrateGroup` over legacy players inside `parseStoredValue`, or make validation repair-then-validate
(default missing optional stats to 0/[] instead of rejecting the record).

### M6. `historyFuture`/`historyPast` entries are trusted but never re-validated against the schema
- `src/utils/storage/historyStore.ts:23-36` (`isHistoryEntry`) only checks `id/label/timestamp/viewRound` types plus
  `competition.groups` being an array; `undo`/`redo`/`jumpToHistory` (`useTournamentStore.ts:134-191`) clone that
  competition straight into the store, and the next `set` persists it as the live tournament.
Trigger: an old/corrupt history envelope (format version has stayed `1` while `CURRENT_STORAGE_VERSION` moved 5, so a
stale payload is accepted the moment ids match) restores a competition with missing player stats; the first render
after undo runs `calculateAllWinRates`/`getRankedPlayers` on it (e.g. `buildRankedGroup`, `competitionState.ts:5-23`)
and can throw.
Fix: run `validateCompetitionData(entry.competition)` for each entry (drop invalid entries rather than the whole
envelope) and bump `HISTORY_FORMAT_VERSION` when the competition schema changes.

## LOW

- L1 `clearCompetition()` (`storage.ts:388-408`) is dead code (no caller outside tests) and, unlike `saveCompetition`,
  assigns the result of its `.catch(...)` back into `writeQueue`, so a failed IDB delete leaves the queued chain in a
  different state than `saveCompetition` expects. A failed delete there would also resurrect data via the same
  newest-`savedAt` rule (the key's old record survives) — no user path reaches it today.
- L2 `snapshot.ts:106` keeps only the newest 5 snapshots with no age floor; on a long tournament the pre-round-1
  snapshot used as a last resort is evicted by five newer automatic snapshots.
- L3 `storage.ts:67-69` `shouldCompress` measures the raw payload, so `compressCompetition` (~30 % smaller) is applied
  to data that would still fit under the 2 MB mirror limit; conversely the mirror limit is measured pre-compression.
- L4 `storage.ts:358-365` re-saves on *any* load whose winner came from localStorage, which is normal operation when
  IDB is absent; that write is fire-and-forget with no error path beyond the banner.
- L5 `storageSync.ts:28-30` opens and closes a `BroadcastChannel` per save; a tab that is being unloaded can miss the
  message, so `useStorageSync`'s conflict detection is best-effort (not a data-safety mechanism).

## Verified correct (read, not executed)

- Write ordering for competition data: every `saveCompetition` path funnels through the `writeQueue` chain
  (`storage.ts:268-281`), and `persistCompetitionEnvelope` awaits both `idbSet`s inside that task, so an older
  in-flight IDB write cannot land after a newer one **within the main-data key**. Same for `clearCompetition`'s
  queued deletes and for `historyStore`'s own queue (writes and `clearCompetitionHistory` share `historyWriteQueue`).
- Crash window on the mirror path (raw ≤ 2 MB, IDB usable): the localStorage write is synchronous and *newer* than the
  in-flight IDB record, and `loadCompetition` sorts by `savedAt` with `local-main` (priority 1) ahead of
  `indexeddb-backup`/`local-backup`, so a crash between the two writes reloads the newer mirror, not stale IDB data.
- Candidate ranking itself: `timestamp()` guards non-finite `Date.parse`, and the source-priority tiebreak is applied
  whenever timestamps tie — no `NaN` comparator.
- The 30-entry cap (`HISTORY_LIMIT`) is applied consistently in `flushHistory`, `undo`, `redo`, `jumpToHistory`
  (`competitionHistory.ts:72`, `useTournamentStore.ts:145,161,180`); `loadCompetitionHistory` is the only path that can
  exceed it (persisted payload only).
- `isNavigationOnly` correctly keeps pure `currentGroupIndex` switches out of history and out of `saveCompetition`,
  and `startTournament`/`startAllGroups` coalesce into one entry via `pendingSnapshot` + `flushScheduled`.
- Read-only enforcement covers the mutation paths I traceable: `createStoreSet` returns before `rawSet`/`saveCompetition`
  whenever `isReadOnly && !allowReadOnly` (`competitionHistory.ts:112`), and `undo`/`redo`/`jumpToHistory` bail out.
- Bye-match modelling matches the schema: every bye producer writes `player2Id: 'bye'` with `result: 'player1'`
  (`swissPairing.ts:414,529,894,922`, `gameFlow.ts:63-73,130-140`), and `schema.ts:155-160` accepts exactly that shape.
- Missing optional group fields are handled defensively downstream: `getRoundGameType` uses
  `group.roundGameTypes?.[round-1] ?? group.gameType` (`swissPairing.ts:11-13`) and every tiebreak entry point goes
  through `resolveTiebreakRules`/`normalizeTiebreakRules` (`tiebreak.ts:35-53`), so a validated-but-sparse record does
  not crash the ranking code.
- Schema coverage of the write paths is otherwise tight: required arrays, unique ids, cross-references
  (`playedAgainst`, `playerIds`, `playoffBracketId`, `waitingPlayerId`), bye consistency, `preDrop` result pairing,
  non-negative integer stats, `0..1` rates, `wonGames <= totalGames`, and `currentGroupIndex` within range. `NaN`
  cannot reach the store from JSON (`JSON.stringify(NaN)` → `null`, which the validators reject).
- `idbGet`/`idbSet` key usage does not collide across features (`swiss_tournament_data`,
  `..._backup`, `swiss_tournament_snapshots`, `match-statistic-competition-history`).

## Unverified

- Whether `idbSet` has ever *actually* been observed to abort after `request.onsuccess` in this app (H4 is derived
  from the IDB spec/known durability guidance, the code path was not executed).
- Whether large multi-group tournaments genuinely cross the 2 MB mirror limit in real use (H3's window size depends
  on the queue's IDB latency, not measured here).
- Safari/Firefox private-mode behaviour in this specific build (H2's premise that `indexedDB` is defined while every
  `open` rejects was not reproduced; `.onblocked` (`indexedDb.ts:35`) shows the codebase anticipates the failure mode).
- No files were modified and no test run was executed (read-only session), so none of the findings are backed by a
  reproducing test.
