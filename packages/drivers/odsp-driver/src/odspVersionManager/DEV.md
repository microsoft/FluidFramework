# ODSP Version History Load — Design Catechism

## How to read this document

This spec is a **catechism**: a hierarchical series of questions and answers that is the prose
mirror of the test suite. Each topic-level question (`###`) corresponds to a `describe` block; each
leaf question maps to one test, linked by a stable **code ID** at the end of the answer. The same ID
appears as a `// @q <id>` tag on the matching test.

ID format: `<area>-<topic>-<nn>`. Area is `M` (the version manager — [Part II](#part-ii--the-version-manager))
or `F` (the file-version fetcher — [Part III](#part-iii--the-file-version-fetcher)). Topic is a short
mnemonic (e.g. `SELECT`, `RESOLVE`). `nn` is a zero-padded counter assigned the lowest number available
within its `<area>-<topic>` group. When a scenario is removed, the remaining IDs in that group are
renumbered to close the gap, so the numbering stays compact with no reserved or retired IDs.

The contract:

- **Every leaf Q&A has a test, and every test has a leaf Q&A**, joined by its code ID. A change to
  behavior is a change to both.
- **This document reflects the code as it is now.** Future/aspirational work lives in
  [Part IV — Directional](#part-iv--directional), written as questions that cannot yet be answered
  "yes".

### Terminology (legend)

This code is one piece of a larger capability — letting a document be viewed or recovered at an
earlier point in time — which spans two repositories:

- **Part 1 — point-in-time load** (this repository): given a target sequence number, produce a
  read-only view of the document at that number.
- **Part 2 — capture & marker** (a separate host repository): record the markers that name the points
  worth returning to. Out of scope for this document.

Part 1 is built in three components:

- **Component A — the version manager**: choose which file version to load or replay from. **This
  folder is Component A**, and this document is mostly about it.
- **Component B — the recomposed driver**: load the chosen version and replay ops forward to the exact
  target. **Built** in `../pointInTimeDriver/` (`getOdspPointInTimeDocumentServiceFactory` /
  `OdspPointInTimeDocumentService`) — see [Part V](#part-v--components-b--c-as-built).
- **Component C — the loader hookup**: expose Component B through the container loader. **Built** in
  `@fluidframework/container-loader` (`loadContainerToSequenceNumber`) — see
  [Part V](#part-v--components-b--c-as-built). This is the current prototype-era package
  placement; the planned feature-package boundary is documented in the
  [point-in-time loading guide](../../../../loader/container-loader/src/pointInTime/DEV.md#package-ownership-and-planned-extraction).

### Vocabulary (the overloaded terms)

Several words describe "the saved state of a document" at different layers, which is a frequent source of
confusion. Everything is built from two primitives — **ops** and the **state** they produce — and the rest
is either a bundle of ops or a saved snapshot of state.

- **Op**: a single change, globally ordered by a **sequence number**. The full history *is* the ordered
  ops; the document is those ops replayed.
- **Summary**: the Fluid **runtime**'s serialized tree of current state. A summarizer client *produces* a
  summary and proposes it via a `summarize` → `summaryAck` op handshake. ("Summary" = the act/content the
  client generates.)
- **Snapshot**: the stored, fetchable form of a summary (tree + blobs, carrying a `sequenceNumber`). To
  load, you fetch a snapshot and replay ops forward. Note two different snapshot lists exist: the driver's
  *Fluid* snapshot list (`getVersions`) is **not** the ODSP file-version history — a different address
  space.
- **ODSP file version**: an entry in the file's version history (driveItem `/versions`, labels like
  `"42.0"`). ODSP surfaces stored snapshots as recoverable version rows, with a retention cap and dedup.
  **This is what Component A selects over.**
- **op stream / `opStream`**: overloaded. As a concept, the ordered op log. As a URL segment, a path prefix
  under which *both* snapshots (`.../opStream/snapshots/...`) and raw ops (`.../opStream?filter=...`) live.
- **delta storage**: the durable REST op log (`OdspDeltaStorageService`), which fetches raw ops by
  sequence-number range and is retention-limited. Distinct from —
- **trailing / bundled ops**: a small tail of ops baked *inside* a snapshot (up to `latestSequenceNumber`),
  returned with the snapshot for free — not a separate fetch.
- **sequence number** = an op's global order index (a snapshot's is the op its tree is current through);
  **latestSequenceNumber** = the last bundled trailing op; **minimumSequenceNumber (MSN)** = the
  collaboration-window floor (seq all connected clients have acked) — **not** a retention/trimming signal.

Chain of custody for one saved state: a **summarizer** writes a **summary** → stored as a **snapshot** →
surfaced by ODSP as a **file version**. Same state, three names because three layers own it.


## Part I — Foundations

These are conceptual answers with no single test; they frame everything below.

### What problem does this code solve?

Given a target Fluid **sequence number** (Fluid numbers every change to a document: op 1, 2, 3, …),
we want to materialize the document as it was at that number. The first step is choosing a **base**:
the most recent saved version whose state is at or before the target, from which the remaining ops
can be replayed. This code finds that base.

### What is an ODSP file version, and how is it different from a Fluid snapshot?

Two different things are both called a "version":

- A **file version** is an entry in the file's version history — a recoverable saved state of the whole
  file, addressed by a label such as `"42.0"`. These are what a user could restore to.
- A **Fluid snapshot** is an internal checkpoint the runtime writes; the driver's snapshot list
  (`getVersions`) enumerates these, not the file versions.

Selecting a base uses the **file version history**, enumerated by the driveItem `/versions` API — not
the driver's snapshot list.

### Why the closest version at or before the target, rather than any earlier one?

Any base at or before the target can be replayed forward to the target and yields the same state, so
the choice is not about correctness. The **closest** one minimizes how many ops must be replayed, and
minimizes the chance that the needed ops have been trimmed from retention. Selection therefore aims for
the greatest version sequence number at or before the target. Because versions are enumerated
newest-first and version order is expected to track sequence order, an early-stop scan finds it; if that
ordering is ever violated, a valid but not-strictly-closest base may be chosen (still correct, just less
optimal) — see [Part IV](#part-iv--directional) for the planned order-tolerant search.

### How is a version's sequence number obtained?

By fetching that version's snapshot from the **version-scoped snapshot endpoint**
(`.../versions/{label}/opStream/snapshots/trees/latest?blobs=2`), which returns the snapshot in the
driver's normal (`application/json` or `application/ms-fluid`) framing. The driver's existing snapshot
parser reads it, and the sequence number is `trees[0].sequenceNumber`. `blobs=2` inlines blob contents
so the parser has everything it needs.

### Can a base be replayed across a version restore (a lineage change)?

No. Replay is only correct while the base version and the live document share one continuous,
monotonically-numbered op stream. ODSP's **epoch** identifies that lineage: a version restore (or a
download-then-reupload) bumps the epoch and renumbers the op stream. A base captured before such a
boundary is on a different lineage than the live document, so replaying the live ops in `(base, target]`
on top of it would silently corrupt the result. A chosen base must therefore be proven to share the live
document's epoch — and to still have its bridging ops retained — before it is used. The lineage proof is
folded into `findBaseForSeq` (see [Part II](#how-does-it-verify-a-chosen-base-can-be-replayed-to-the-target)),
backed by a structural epoch guard in [Part V](#part-v--components-b--c-as-built).

### What is deliberately not built in *this folder*?

Components B and C now exist, but elsewhere: the recomposed driver in `../pointInTimeDriver/` and the
loader hookup in `@fluidframework/container-loader` (see
[Part V](#part-v--components-b--c-as-built)). This folder (Component A) still owns only base selection.
Not built anywhere yet: bridging a trimmed op range via an intermediate snapshot, and a test against a
live ODSP file. See [Part IV](#part-iv--directional).

## Part II — The Version Manager

`OdspVersionManager` selects the base version. It depends on an injected `IOdspFileVersionFetcher`, so
these behaviors are tested with an in-memory fake.

### Which version does `findBaseForSeq` pick for a target sequence number?

The list is newest-first, and the tip (index 0, the newest version) is excluded: it is the one version
whose sequence number is not yet static, so it cannot be a stable base. Among the remaining (sealed)
versions the answer is the closest one at or before the target — the greatest sequence number at or before
the target when version order tracks sequence order, which an early-stop newest-first scan finds.

- **Target between two versions?** The closer, older one. `M-SELECT-01`
- **Target equal to a version?** That version, an exact match (zero ops to replay). `M-SELECT-02`
- **Target newer than every sealed version?** The newest sealed version. `M-SELECT-03`
- **Target older than every version?** `noBaseVersion`, reporting the oldest sequence number seen.
  `M-SELECT-04`

### How does it handle the tip, duplicate versions, and empty history?

- **The tip (index 0)?** Never treated as a base; its sequence number is never even resolved. `M-TIP-01`
- **Only the tip exists?** `noBaseVersion` — the sole version is excluded as a base. The wired consumer
  (the point-in-time document service factory) surfaces this as a `UsageError`; loading the live document
  for a near-head target is a possible future consumer choice, not current behavior. `M-TIP-02`
- **Two versions share a sequence number?** Return the newest label (a metadata-only re-save leaves the
  sequence number unchanged; the newest is closest to the head). `M-DEDUP-01`
- **No versions at all?** `noBaseVersion`. `M-EMPTY-01`

### What work does it avoid when scanning?

- **Resolving more versions than needed?** It stops at the first version at or before the target and does
  not resolve older ones. `M-STOP-01`

### What is cached, and what is re-fetched?

Resolved sequence numbers are memoized; the version list is not. A sealed version's sequence number never
changes, so once resolved it is reused for the manager's lifetime rather than re-fetched. The version
list, by contrast, changes as new versions are cut, so it is **re-enumerated on every query**. This
mirrors how Page History (`host-page-history`) works: its `PageHistoryVersionManager` pulls the ODSP
version list fresh on each navigation (`refreshVersions()`), caching only the expensive loaded *content* —
not the list. Page History's `#getOdspVersions` likewise dedups and drops the tip (`slice(1)`), the same
two rules applied here.

The manager is short-lived — the point-in-time document service factory creates one per load and calls
`findBaseForSeq` once, then drops it — so the memoization caches never grow large and need no eviction.

- **Re-resolving a sequence number across calls?** Each version's number is memoized, so a later query
  reuses it rather than re-fetching. `M-CACHE-01`
- **A version-list fetch that fails?** It propagates rather than being read as empty; the list is
  re-enumerated on the next call. `M-CACHE-02`

### What happens when a version cannot be resolved?

The failure propagates; it is never swallowed into a wrong base. `M-ERR-01` A failed resolution is not
cached, so a later call re-attempts it rather than replaying the cached rejection. `M-ERR-02`

### What does `listVersions` return?

Every version with its resolved sequence number, newest-first. `M-LIST-01` The tip's number is resolved
fresh on every call (never cached, since it is not yet stable), while sealed versions are served from the
cache. `M-LIST-02`

### How does it verify a chosen base can be replayed to the target?

`findBaseForSeq` both *picks* the closest version and *proves* it can be used: before returning a
`found` base it checks that base shares the live document's lineage, so a cross-lineage base fails as a
clear non-retryable error before any document service is built instead of a corrupt or stalled load.
There is no separate public validation step — the lineage check is folded into selection so a caller
cannot obtain an unvalidated base. Op availability is _not_ checked here — it is enforced by the
delta-storage stack as the loader streams the bridging ops (Part V), because the lineage gate is the
only check that must run before choosing to build the services.

**Lineage (epoch).** It reads the live document's epoch and the chosen base version's epoch and compares
them.

- **Base and live share an epoch?** Returns the base. `M-VALIDATE-01`
- **Base on a different epoch than the live document?** Throws, naming both epochs, and reuses the
  driver's canonical `fileOverwrittenInStorage` epoch-mismatch error (the same `errorType` the shared
  `EpochTracker` raises) rather than a generic `UsageError`, so the loader sees one machine-readable,
  non-retryable error for a cross-lineage base. `M-VALIDATE-02`
- **Either epoch unknown?** Fails closed — without both epochs the shared-lineage claim cannot be proven.
  `M-VALIDATE-03`

A numbered version's snapshot is immutable, so its epoch is read once and memoized per versionId; the
live document's epoch can change (a restore or download-and-reupload bumps it) and is therefore read
fresh on every lineage check, never cached. `M-VALIDATE-CACHE-01`

**Op availability.** This is _not_ re-checked up front, and Component B adds no check of its own. Op
retention trims a contiguous _prefix_ from the oldest end of the stream, and op sequence numbers are
contiguous by construction, so the ordinary delta-storage stack already enforces exactly what a replay
needs: `validateMessages` (strict) discards any fetched batch that does not begin at the requested
`from`, and `requestOps`/`ParallelRequests` keep requesting until the whole bounded range has been
delivered, asserting contiguity as they dispatch. A bounded stream that reaches `done` has therefore
necessarily served the full bridge; a range that never materializes fails the fetch instead (the delta
stack polls, then throws its non-retryable "Failed to retrieve ops from storage (Too Many Retries)"
error). The `OdspPointInTimeDocumentService` delta-storage wrapper (Part V) only bounds every fetch at
the target. Because the wrapper rides the live document's delta storage, the creation snapshot's ops
are already merged in for free.

## Part III — The File-Version Fetcher

`createOdspFileVersionFetcher` is the real `IOdspFileVersionFetcher`, talking to ODSP. Its behaviors
are tested against a stubbed `fetch` that returns canned responses through the real request,
authentication, and snapshot-parsing code.

### How does it enumerate versions?

It calls the driveItem versions URL — built from the same API root as the snapshot call — and maps the
`value` array of each page to versions (newest-first). `F-LIST-01` A long history is paged, so it follows
`@odata.nextLink` until it is absent and concatenates every page; a base version beyond the first page is
therefore still found rather than mistaken for `noBaseVersion`. `F-LIST-02` A response without a `value`
field yields an empty list rather than an error. `F-LIST-03`

### How does it resolve a version's sequence number?

- **A well-formed snapshot?** It calls the version-scoped snapshot URL (`.../versions/{label}/opStream/snapshots/trees/latest?blobs=2`),
  parses the response, and returns `trees[0].sequenceNumber`. `F-RESOLVE-01`
- **A snapshot with no sequence number?** It throws, naming the version, rather than returning a wrong
  value. `F-RESOLVE-02`
- **A snapshot whose sequence number is present but not a valid non-negative integer?** It throws rather
  than coercing a wrong value into base selection. `F-RESOLVE-06`
- **A binary (`application/ms-fluid`) snapshot?** It reads it with the driver's compact-snapshot parser
  and returns the same sequence number the JSON path would. `F-RESOLVE-03`
- **An unexpected content-type (e.g. an HTML error page)?** It throws rather than mis-parsing the body as
  a compact snapshot. `F-RESOLVE-04`
- **A version label with characters that need escaping?** The label is percent-encoded into the snapshot
  URL. `F-RESOLVE-05`

### How does it handle request failures?

- **A non-success response while enumerating?** The failure propagates rather than being read as an
  empty result. `F-ERROR-01`
- **A non-success response while resolving?** Likewise, it propagates rather than yielding a wrong value.
  `F-ERROR-03`
- **An authentication failure while enumerating?** The shared token-refresh wrapper refreshes the token
  and retries the request once. `F-ERROR-04`
- **An authentication failure while resolving?** Likewise, it refreshes the token and retries once.
  `F-ERROR-02`

### How does it read a version's or the live document's lineage (epoch)?

The ODSP `x-fluid-epoch` header identifies the file's binary lineage. It is read with the raw fetch
helper — deliberately **not** `epochTracker.fetch`, whose whole job is to pin the first epoch and reject
a divergent one, which would make comparing two epochs impossible — and the response body is consumed and
discarded, keeping only the header.

- **The live document's epoch?** From the unversioned live snapshot endpoint (`blobs=0`), never a
  versioned URL. `F-EPOCH-01`
- **A specific version's epoch?** From that version's snapshot endpoint
  (`.../versions/{label}/opStream/snapshots/trees/latest?blobs=0`). `F-EPOCH-02`
- **The server sends no epoch header?** Returns `undefined` rather than throwing; the caller fails closed
  on an unknown epoch. `F-EPOCH-03`

### How does it verify a base shares the live document's lineage?

Versions carry their own ODSP epoch (`x-fluid-epoch`). `getLiveDocumentEpoch` and
`getRecoverableVersionEpoch(versionId)` read that header from the live and version-scoped snapshot
endpoints (`...?blobs=0`, metadata only). The version manager compares the two; a mismatch means a
restore or download-then-reupload renumbered the op stream, so the base is a different lineage.

Op availability is deliberately _not_ fetched here — it is enforced by the delta-storage stack against
the ops the loader reads (see Part V), which also gives the creation snapshot's ops for free.

## Part IV — Directional

Aspirational behaviors, written as questions that cannot yet be answered "yes".

### Should sequence-number resolution be lazy or binary-search, rather than eager?

Resolving each version costs one snapshot fetch. With up to ~50 versions, an eager newest-to-oldest
scan can fetch more than necessary. The public contract (`findBaseForSeq`) already hides the strategy,
so a binary search over versions could replace it without changing callers.

The version list is effectively a sorted array: it is newest-first, and a version's sequence number is
monotonically non-increasing toward older versions (a newer version is a later state). That makes it
searchable for "the greatest sequence number at or before the target". The search must be "fuzzy" rather
than textbook, for two reasons: versions can share a sequence number (a metadata-only re-save leaves it
unchanged), so it is a sorted array with duplicates; and the ordering can have small local inversions.
The robust shape is therefore binary/interpolation to get close, then a short local walk (older if the
probe overshot the target, newer while still at or before it) to pin the exact base and absorb ties and
inversions.

Two further refinements reduce fetches. First, a version's sequence number never changes, so once
resolved it can be cached indefinitely; refreshing only needs to reconcile which versions still exist
(dropping ones that aged out), not re-resolve sequence numbers. Second, selection does not need the exact
closest version — any version within a bounded number of ops of the target is "close enough", because the
recomposed driver replays the remaining ops anyway; a tolerance lets the search stop early.

### Could the version list's `lastModifiedDateTime` seed the search?

Each version carries a `lastModifiedDateTime` in the list response, for free — unlike a sequence number,
which costs a fetch to resolve. If the target is accompanied by a wall-clock time (for example, a time
recorded when a mark was made), that timestamp does not replace the search — it replaces its **first
probe**. Instead of starting at the blind midpoint, seed at the newest version whose
`lastModifiedDateTime` is at or before the target time (a comparison over the already-fetched list, zero
fetches), then converge:

1. Resolve the seed version's sequence number (the first fetch).
2. If it overshot the target (`seq > target`), step toward older versions; if it is at or before the
   target, step toward newer versions while still at or before it — to land on the greatest sequence
   number at or before the target.
3. Because time, list order, and sequence number all move together, this correction is usually zero or
   one step. If the seed is far off (large clock drift), fall back to binary search over the residual
   interval, bounding the worst case at ~log N.

The timestamp is only a seed, never the answer: time does not map linearly to sequence number (edits are
bursty) and clocks can skew, so the neighbourhood it points to must still be pinned by resolving sequence
numbers. Timestamps are ISO-8601 UTC; any caller-supplied time must be normalized to UTC before
comparison. It also allows locating a version by time when no sequence number is available. This is why
`lastModifiedDateTime` is carried on a version even though base selection itself does not use it today.



### How would Component B bridge a *trimmed* op range between snapshots?

Component B is built (see [Part V](#part-v--components-b--c-as-built)), but the version it ships makes
one simplifying assumption: it loads a single base file version and replays the ops in `(base, target]`
from the **live** document's delta storage. That assumption holds only while those ops are still
retained — and a base whose bridging ops have been trimmed is still **detected**, by the ordinary
delta-storage stack as the loader reads them: it discards any batch that does not start at the
requested op and keeps requesting the remainder, so the fetch fails
(see [Part V](#part-v--components-b--c-as-built)) rather than replaying a truncated range. What is
still not built is **recovering** from that case: bridging a trimmed range by starting from a newer
intermediate snapshot is the part that is not built yet — the rest of this answer is its design.

A snapshot already contains the full accumulated state at its sequence number — the tree *is* the
materialized state at `sequenceNumber`, with every earlier op baked in (nothing is replayed to *reach*
the snapshot). So to reach a target `T`, Component B loads the closest base snapshot (`seq ≤ T`) and
replays only the ops in `(base, T]` on top of it.

Those ops come from two distinct pools:

1. **The snapshot's own bundled ops.** Every stored snapshot carries a frozen tail of the ops *after* its
   base — a `deltas` section the summarizer writes into the snapshot itself (`writeOpsSection` in
   `compactSnapshotWriter.ts`), surfaced by the parser as `ISnapshot.ops` with `latestSequenceNumber` = the
   last such op (`odspSnapshotParser.ts`). This tail is intrinsic to the snapshot object: the version-scoped
   snapshot endpoint returns it whether or not `deltas=1` is asked, and its first op is always `base + 1`
   (`fetchSnapshot.ts` asserts `ops[0].sequenceNumber - 1 === sequenceNumber`). So `(base, latestSequenceNumber]`
   is available for free, no extra fetch.
2. **The standalone op log.** Anything beyond `latestSequenceNumber` is fetched from ODSP **delta storage** —
   `OdspDeltaStorageService.get(from, to)`, which issues
   `.../opStream?ump=1&filter=sequenceNumber ge {from} and sequenceNumber le {to-1}` (`odspDeltaStorageService.ts`;
   URL built from `getUrlBase`/`getDeltaStorageUrl` in `odspDriverUrlResolver.ts`). This is the same op-fetch
   path the container's DeltaManager uses.

Ops in the standalone op log are retained for a window (time-based, best-effort ~7 days measured from each
version's date — confirmed with the ODSP storage team, who reduced it from ~30 days earlier this year) and
can be trimmed. There is no field that advertises the earliest retained op; a gap is
discovered by asking the op stream for the range and getting a short result (delta storage assumes the
server returns all ops it has in the requested range). The resolution is not to fetch the trimmed ops from
somewhere else — it is to **start from a newer snapshot that already absorbed them**. If the ops just after
the base are gone but another snapshot exists later in `(base, T]`, that snapshot's state already includes
the trimmed ops, so Component B starts there and replays only the retained tail. Trimmed ops are never
re-fetched; a later snapshot makes them unnecessary.

The target is only unreachable when all of the following hold: the nearest snapshot at or before `T` is
old, the ops between it and `T` have been trimmed, and no snapshot falls anywhere in between to bridge
the gap. In that case the exact state at `T` cannot be reconstructed, and Component B reports it
(for example, a `missing ops` / not-materializable outcome) rather than returning a wrong state — a
consumer may still choose to fall back to the nearest reachable state at or before `T`.

Put precisely, the exactly-recoverable targets are **every snapshot (they are durable, not op-retention-bound),
plus any target whose replay ops `(base, T]` still fall within the op-retention window**. A target older than
retention that lands *between* snapshots — no snapshot on it, and its ops trimmed — is not exactly
reconstructable: ops cannot be un-applied, so overshooting to a later snapshot does not help. This is rare in
practice because snapshots are written frequently relative to the op-retention window, but it is a real limit,
not a bug — so the honest behavior is to report the nearest reachable point rather than a wrong state.

Note that `minimumSequenceNumber` is not the signal for any of this: it is the collaboration-window floor
baked into a snapshot, used when a snapshot is loaded, not an indicator of which ops the op stream still
retains. Op availability is determined by what the delta stream actually serves for the range, not by a
version's minimum sequence number.

### Should there be an end-to-end test against a real ODSP file?

The fetcher is covered by stubbed-`fetch` integration tests, but not against a live file (which needs
tenant credentials). An end-to-end test would exercise the real endpoints.

### Should the raw driveItem `/content` download be a supported fallback?

The `/content` download also contains a version's snapshot, but wrapped in a container framing the
snapshot parser does not read directly. If the version-scoped snapshot endpoint is ever unavailable,
unwrapping `/content` could be a fallback path.

### How should near-head targets work when there is no sealed base?

The newest file-version row is intentionally excluded because its sequence number can still advance.
When it is the only row, or when sequence number `0` predates every sealed row, the current factory
returns `noBaseVersion` and the loader surfaces a `UsageError`. Decide whether the driver should keep
that strict behavior or use a separately fetched live/creation snapshot as a read-only base when it can
prove the snapshot is at or before the target. Add real-service coverage for sequence number `0`, an
only-tip file, a target equal to the current tip, and a target just behind the tip.

### What numeric target range does the ODSP capability accept?

`loadContainerToSequenceNumber` rejects negative and fractional values, but the ODSP factory is also an
exported capability that can be called directly, and the bounded delta wrapper computes
`targetSequenceNumber + 1`. Define and enforce a non-negative safe-integer contract at the driver
boundary too, including `Number.MAX_SAFE_INTEGER`, so the exclusive upper bound cannot overflow or lose
precision.

### What happens when version history changes while a load is being built?

The list can add a new head, age out an old row, or lose the selected version between enumeration,
sequence-number resolution, lineage validation, URL resolution, and the eventual snapshot read. Add
tests for each churn point. A disappeared base should trigger one bounded re-enumeration/reselection
when safe, or surface a clear non-retryable availability error; it must not reuse stale list membership
or fall through to a different version silently. If a long-lived manager is ever reused, reconcile the
sequence/epoch caches with versions that have aged out.

### How is partial construction cleaned up?

`createPointInTimeDocumentService` creates the recoverable service before the live service. If live
service creation or later composition fails, the already-created recoverable service must be disposed.
Add fault-injection coverage at base selection, version URL resolution, recoverable-service creation,
live-service creation, storage connection, and delta-storage connection, and verify cleanup preserves
the original error.

### Does the complete point-in-time path preserve retries, cancellation, and authentication?

Fetcher unit tests cover token refresh for version enumeration and sequence-number resolution, but the
composed load has no end-to-end regression spanning version discovery, base snapshot fetch, and live-op
replay. Cover an auth refresh in each phase, an abort during each phase, and a retrying op fetch that is
canceled by the caller. Cancellation should reach the active ODSP request rather than merely closing the
loader-side container while background retries continue.

### Is the snapshot-op to live-op handoff explicitly covered?

The ordinary ODSP delta stack reads trailing ops bundled in the selected snapshot, then persisted ops
cache, then network storage. Add a focused integration test where the target crosses each source, with
the handoffs exactly at `latestSequenceNumber` and an ops-cache batch boundary. Cover duplicate and
missing boundary ops, a partial dirty cache batch that has not yet been flushed, and a cache gap that
forces all later reads to storage. Verify the bounded wrapper neither replays one twice nor skips one.

### How are sequenced but not yet persisted ops materialized?

`OdspDeltaStorageWithCache` calls `requestFromSocket(from, to)` before consulting persisted cache and
storage. In a normal connected load, that sends PUSH `get_ops`; its response is emitted on the delta
connection and can supply ops that have sequenced but have not yet been flushed to the ODSP op-stream
endpoint. The storage request still runs, while the live connection gives DeltaManager another route to
make progress.

The point-in-time service advertises `storageOnly`, so the connection manager never creates that live
delta connection. Its live ODSP document service therefore has no `currentDeltaConnection`, making
`requestFromSocket` a no-op. A target can be resolved by a live version-mark resolver and still be
temporarily unavailable to the historical loader until the ordering service persists it. For a known
bounded range, `getSingleOpBatch` retries an empty storage response and fails after roughly 30 seconds.

Define the product contract for this window: wait for eventual persistence, expose a retryable
“sequenced but not persisted” result, coordinate an explicit PUSH `flush_ops`, or give the historical
service a narrowly scoped way to retrieve PUSH-only ops without becoming a writable/live container.
Add a real-service test that resolves a mark and immediately loads it, plus delayed-persistence,
cancellation, and never-persisted variants.

### How does `ParallelRequests` batching interact with the target bound?

The point-in-time wrapper converts every DeltaManager request, including one with no `to`, into the
known bounded range `[from, target + 1)`. `requestOps` divides that range into transport pages using
`opsBatchSize` and may issue `concurrentOpsBatches` pages concurrently. `ParallelRequests` buffers
out-of-order responses by their starting sequence number and dispatches only contiguous pages. A
partial snapshot/cache response continues from its first missing sequence number; an oversized response
is split; a known final page is retried until complete; and cancellation may leave later buffered pages
intentionally undispatched. Its separate “learn the end from a short response” mode is not used by
point-in-time loading because `target + 1` is always known.

Point-in-time coverage currently tests only the wrapper's per-call `to` clamp and simple ordered streams.
Add integration coverage with small page sizes and concurrency greater than one: targets on every page
boundary, out-of-order completion, partial and oversized pages, a final short page, cancellation with
requests in flight, and verification that speculative requests and buffered results beyond
`target + 1` are never delivered.

Also cover failure ordering: allow later pages to complete while the first missing page retries, then
make that earlier page fail. No later page may cross the gap, the stream must surface the terminal error
once, and late completions after cancellation/failure must be ignored. Deep-history loads need a
backpressure/memory test because both the out-of-order `results` map and the stream `Queue` can retain
whole pages when producers outrun the consumer.

Finally, validate `opsBatchSize` and `concurrentOpsBatches` at the ODSP boundary. Zero or negative
concurrency currently reaches a `ParallelRequests.run()` assertion, while very large values can create
excessive requests and buffered data. Define positive-integer requirements and practical upper bounds,
with explicit `UsageError` behavior rather than an internal assertion or resource spike.

### Which `OpsCache` batches are visible to a historical load?

`OpsCache` groups ops into persisted-cache batches (100 ops by default). Full batches are written
immediately; partial dirty batches are written only by the timer or document-service disposal, and
`OpsCache.get()` reads persisted entries rather than another service instance's in-memory dirty batch.
A newly created point-in-time service can therefore miss recently received ops that are neither in its
snapshot nor flushed to persisted cache/storage.

Cover full and partial cache batches, leading/trailing empty slots, timer and dispose flushes racing a
historical read, gaps between cache batches, and the `useCacheForOps` transition that permanently stops
consulting cache after the first miss. The source merge must remain contiguous when the same op is
available from snapshot, cache, PUSH, or storage, even though the current storage-only point-in-time
path cannot consume the PUSH source.

### Are concurrent and routed historical loads isolated?

Each point-in-time load creates a fresh `NonPersistentCache` and per-load shared `EpochTracker`, but this
is not covered under concurrency. Run simultaneous loads to different targets, dispose one while the
other is reading, then perform a normal live load with the same credentials. Also cover a resolved URL
with `dataStorePath` and `codeHint` so version URL rewriting preserves routing metadata without leaking
historical cache entries into another load.

## Part V — Components B & C, as built

Component A (this folder) only selects the base. Components B and C — which materialize the document at
the target and expose it through the loader — are now built, in other files. They carry no catechism
code IDs here (those index Component A's suite); Component B's lineage guard is covered by
`../test/odspPointInTimeDocumentServiceFactory.spec.ts` — both the structural shared-`EpochTracker`
wiring and the up-front recoverable-vs-live epoch comparison (a mismatch fails the load before any
service is built; a matching epoch proceeds to create both services) — and its bounded `fetchMessages`
clamp (an unbounded, past-target, or before-target `to`, plus op pass-through) by
`../test/odspPointInTimeDocumentService.spec.ts`; the rest are conceptual answers in the spirit of
[Part I](#part-i--foundations). The one still-directional gap is bridging a
*trimmed* op range via an intermediate snapshot (see [Part IV](#part-iv--directional)); everything below
is what ships today.

### Component B — how does the recomposed driver materialize the target?

The factory returned by `getOdspPointInTimeDocumentServiceFactory` (in `../pointInTimeDriver/`)
extends `OdspDocumentServiceFactoryCore` internally and adds
`createPointInTimeDocumentService(resolvedUrl, targetSequenceNumber)`:

1. Build a version manager (Component A), sharing the single `EpochTracker` described below, and call
   `findBaseForSeq(target)`. It picks the closest version *and* proves that base shares the live
   document's epoch before returning it (see
   [Part II](#how-does-it-verify-a-chosen-base-can-be-replayed-to-the-target)); a cross-lineage base
   throws the non-retryable `fileOverwrittenInStorage` error. A `noBaseVersion` result becomes a
   `UsageError` naming the target and the oldest resolved sequence number.
2. Resolve the chosen file version into a version-scoped resolved URL, then create two ordinary ODSP
   document services: a **recoverable** one bound to that base version (its storage is the base
   snapshot) and a **live** one (its delta storage supplies the ops to replay). Both are created via
   `createDocumentServiceCore` with a **single shared** `EpochTracker` (the same one the version
   manager reads through) — this is the structural lineage guard; see the next question.
3. Return an `OdspPointInTimeDocumentService` composing the two.

It lives in this package rather than a generic wrapping driver (e.g. `@fluidframework/replay-driver`)
because loading a historical file version is a storage-layer concern: it needs the version-scoped
snapshot fetch, the epoch tracker, and authentication — all internal to this driver — and it consumes
the version manager in-package, so the manager itself needs no exported surface.

### Component B — what stops replay across a lineage boundary (a restore)?

Replay only produces a correct result while the base version and the live document are on the **same
lineage** — one continuous, monotonically-numbered op stream. ODSP's **epoch** is exactly that lineage
id: a version restore (or download-then-reupload) bumps the epoch and renumbers the op stream
(`epochTracker.ts:82-89`). If the base file version predates such a boundary, its snapshot is from the
old lineage while the live ops in `(base, target]` are from the new one, so replaying them would
silently corrupt the materialized state (see [Part I / can a base replay across a lineage change?](#can-a-base-be-replayed-across-a-version-restore-a-lineage-change)).

The guard has **two layers**. **Up front**, `findBaseForSeq` validates the chosen base's lineage before
returning it (and thus before `createPointInTimeDocumentService` builds any service): it reads the base
version's epoch and the live document's epoch and, if they differ, rejects the load with the driver's
canonical `fileOverwrittenInStorage` epoch-mismatch error — the *same* `errorType` the shared
`EpochTracker` raises structurally — so both layers surface one consistent, non-retryable error for a
cross-lineage base. This up-front comparison is
exercised end-to-end at the factory: `test/odspPointInTimeDocumentServiceFactory.spec.ts` drives a real
version manager whose recoverable-version epoch differs from the live document's and asserts the load is
rejected *before* any service is created (with a matching-epoch companion that proceeds to build both).
**Structurally**, it then
threads one `EpochTracker` through every read — the version-history reads that pick the base, the
recoverable base snapshot, and the live op stream — by passing a single shared `ICacheAndTracker` to
`createDocumentServiceCore` for both services. An `EpochTracker` pins itself to the first epoch it sees
and throws `fileOverwrittenInStorage` ("Epoch mismatch") on any later divergence
(`epochTracker.ts:130-132, 496-511`), so even a lineage change that slips past the up-front check is
caught as reads happen and the load fails loudly instead of returning a wrong document. A fresh
`NonPersistentCache` backs that shared tracker so this read-only historical load stays isolated from the
factory's cache — a base version's snapshot can never leak into a normal live load. (The structural
guard — shared-tracker threading and divergent-epoch rejection — is verified by the same spec.)

### Component B — which `IDocumentService` method drives the replay?

`OdspPointInTimeDocumentService` is read-only and advertises the `storageOnly` document-service policy.
Its three `IDocumentService` methods:

- `connectToStorage` → the recoverable (base-version) service's storage: the base snapshot.
- `connectToDeltaStorage` → wraps the **live** service's delta storage and clamps every
  **`fetchMessages(from, to, …)`** call to an exclusive upper bound of `targetSequenceNumber + 1`, so no
  op past the target is ever fetched. The clamp is all it does: op availability is already enforced
  beneath it by the delta-storage stack, which discards any batch not starting at the requested `from`
  and keeps requesting until the bounded range is fully delivered — so a stream that completes has
  necessarily served the whole bridge, and one that cannot fails the fetch.
  **`fetchMessages` is the method that drives the bounded replay.**
- `connectToDeltaStream` → throws: under `storageOnly` the connection manager synthesizes a frozen,
  read-only delta stream instead of opening a live socket, so this is never called under normal flow.

The `storageOnly` policy is the key mechanism: it forces the container read-only and reuses the loader's
existing "frozen" delta stream, and the delta manager then catches up from the base snapshot's sequence
number through delta storage — the bounded `fetchMessages` replay — up to and including the target op.

### Component B — what request does the bounded `fetchMessages` actually make?

The point-in-time service builds no URL of its own: `connectToDeltaStorage` wraps the **live** service's
delta storage and only clamps the `to` argument (`Math.min(to, targetSequenceNumber + 1)`). Everything
below is the ordinary ODSP delta path (`OdspDeltaStorageWithCache` → `OdspDeltaStorageService`), just
range-constrained by that clamp.

`OdspDeltaStorageWithCache.fetchMessages` is a **paged stream**, not a single request: via `requestOps`
it walks the requested `[from, to)` in batches, checking three sources in order — ops bundled with the
base snapshot, then the cache, then network storage — so the clamp guarantees no page is ever requested
past the target.

The network leg (`OdspDeltaStorageService.get`) is where the request is constructed:

- **URL** (`buildUrl`): `${deltaStorageUrl}?ump=1&filter=` + `encodeURIComponent("sequenceNumber ge {from} and sequenceNumber le {to - 1}")`.
  `deltaStorageUrl` is `.../drives/{driveId}/items/{itemId}/opStream`. Because `from` is inclusive and
  `to` exclusive, the filter is `ge {from} and le {to - 1}`; with the clamped `to = target + 1` the
  effective server bound is `sequenceNumber le target` — the target op is included, nothing beyond it.
- **Method & body**: despite fetching ops it issues a **`POST`** carrying `X-HTTP-Method-Override: GET`,
  encoded as `multipart/form-data` (the `ump=1` "unified multipart" framing). The auth token rides in the
  form body (`Authorization: {authHeader}` / `_post: 1`), not a header.
- **Plumbing**: the call goes through the `epochTracker` (epoch/consistency checks) and
  `getWithRetryForTokenRefresh` (one token-refresh retry), with a 30s `AbortController` timeout as a
  hang mitigation.

So the target bound flows `target + 1` → `Math.min` clamp → stream page `to` → `le {to - 1}` filter,
and the `opStream` endpoint is queried for exactly `[from, target]`.

### Component C — how is this exposed through the loader?

`loadContainerToSequenceNumber` (in `@fluidframework/container-loader`):

1. Validates `loadToSequenceNumber` is a non-negative integer (`UsageError` otherwise).
2. Detects the point-in-time capability with `asPointInTimeCapableFactory`, which checks the passed
   `documentServiceFactory` exposes `createPointInTimeDocumentService`. A plain factory is a
   `UsageError` — the caller must pass the result of `getOdspPointInTimeDocumentServiceFactory`
   directly, with no wrapping.
3. Wraps it in a `PointInTimeDocumentServiceFactory` adapter so the container's normal
   `createDocumentService(resolvedUrl)` routes to `createPointInTimeDocumentService(resolvedUrl, target)`.
   (`createContainer` throws — the adapter is load-only.)
4. Delegates to `loadContainerPaused(...)` with inbound/outbound processing paused, returning a
   disconnected, read-only historical view of the container at the target sequence number.
