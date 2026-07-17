# ODSP Version History Load — Design Catechism

## How to read this document

This spec is a **catechism**: a hierarchical series of questions and answers that is the prose
mirror of the test suite. Each topic-level question (`###`) corresponds to a `describe` block; each
leaf question maps to one test, linked by a stable **code ID** at the end of the answer. The same ID
appears as a `// @q <id>` tag on the matching test.

ID format: `<area>-<topic>-<nn>`. Area is `M` (the version manager — [Part II](#part-ii--the-version-manager))
or `F` (the file-version fetcher — [Part III](#part-iii--the-file-version-fetcher)). Topic is a short
mnemonic (e.g. `SELECT`, `RESOLVE`). `nn` is a zero-padded counter. IDs are append-only: existing IDs
never renumber, so links stay stable across edits.

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
  target. Not built yet.
- **Component C — the loader hookup**: expose Component B through the container loader. Not built yet.

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

### What is deliberately not built here?

Loading the base and replaying ops to the exact target (Component B), the loader hookup (Component C),
and any test against a live ODSP file. See [Part IV](#part-iv--directional).

## Part II — The Version Manager

`OdspVersionManager` selects the base version. It depends on an injected `IOdspFileVersionFetcher`, so
these behaviors are tested with an in-memory fake.

### Which version does `findBaseForSeq` pick for a target sequence number?

The list is newest-first, and the tip (index 0, the live document) is not a base candidate. Among the
remaining versions, the answer is the closest one at or before the target — the greatest sequence number
at or before the target when version order tracks sequence order, which an early-stop newest-first scan
finds.

- **Target between two versions?** The closer, older one. `M-SELECT-01`
- **Target equal to a version?** That version, an exact match (zero ops to replay). `M-SELECT-02`
- **Target newer than every version?** The newest recoverable version. `M-SELECT-03`
- **Target older than every version?** `noBaseVersion`, reporting the oldest sequence number seen.
  `M-SELECT-04`

### How does it handle duplicate versions and the tip?

- **Two versions share a sequence number?** Return the newest label (a metadata-only re-save leaves the
  sequence number unchanged; the newest is closest to the head). `M-DEDUP-01`
- **The tip (index 0)?** Never treated as a base; its sequence number is never even resolved.
  `M-TIP-01`
- **Only the tip exists?** `noBaseVersion`. `M-TIP-02`
- **No versions at all?** `noBaseVersion`. `M-EMPTY-01`

### What work does it avoid?

- **Resolving more versions than needed?** It stops at the first version at or before the target and
  does not resolve older ones. `M-STOP-01`
- **Re-fetching across calls?** The version list and each resolved sequence number are cached.
  `M-CACHE-01`
- **Stale caches?** `refresh()` drops both the version list and the resolved sequence numbers, so the
  next query re-enumerates and re-resolves. `M-CACHE-02`
- **A `refresh()` while a fetch is still in flight?** The cache holds the pending fetch rather than its
  eventual value, so a fetch that started before the refresh cannot write its now-stale result back over
  the cleared cache; the next query re-fetches. `M-CACHE-03`

### What happens when a version cannot be resolved?

The failure propagates; it is never swallowed into a wrong base. `M-ERR-01`

### What does `listVersions` return?

Every version with its resolved sequence number, newest-first. `M-LIST-01`

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
- **A binary (`application/ms-fluid`) snapshot?** It reads it with the driver's compact-snapshot parser
  and returns the same sequence number the JSON path would. `F-RESOLVE-03`

### How does it handle request failures?

- **A non-success response while enumerating?** The failure propagates rather than being read as an
  empty result. `F-ERROR-01`
- **A non-success response while resolving?** Likewise, it propagates rather than yielding a wrong value.
  `F-ERROR-03`
- **An authentication failure while enumerating?** The shared token-refresh wrapper refreshes the token
  and retries the request once. `F-ERROR-04`
- **An authentication failure while resolving?** Likewise, it refreshes the token and retries once.
  `F-ERROR-02`

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



### Should there be a component that loads the base and replays ops to the exact target? (Component B)

The manager only chooses the base. Materializing the document at an arbitrary target requires loading
that version read-only and replaying the ops between the base and the target — sourcing later ops from
the live op stream when the historical range has been trimmed.

Where would it live? In **this package**. Loading a historical file version is a storage-layer concern:
it needs the version-scoped snapshot fetch, the epoch tracker, and authentication — all internal to this
driver — and it consumes the version manager directly. A generic wrapping driver that only replays ops
over an inner document service (the pattern `@fluidframework/replay-driver` uses) cannot reach the
version-scoped base fetch, so the recomposition belongs beside `OdspDocumentService` /
`OdspDocumentServiceFactory` rather than in a separate package. Because it consumes the version manager
in-package, the version manager itself needs no exported surface; only the recomposed factory is exposed
(defaulting to an internal entry point) for the loader hookup to construct.

A base is only needed when the live document's own snapshot no longer covers the target; when it does,
loading paused at the target from the live snapshot suffices, and no historical version is loaded.

### How would Component B reach a target between snapshots, and handle trimmed ops?

A snapshot already contains the full accumulated state at its sequence number — every op at or below it
is baked in. So to reach a target `T`, Component B loads the closest base snapshot (`seq ≤ T`) and
replays only the ops in `(base, T]` on top of it. Those ops come from the op stream (delta storage), and
may also be bundled with a snapshot (the `deltas=1` query parameter, deliberately omitted here because
the manager only needs the sequence number, not the ops).

Ops in the op stream are retained for a window and can be trimmed. The resolution is not to fetch the
trimmed ops from somewhere else — it is to **start from a newer snapshot that already absorbed them**. If
the ops just after the base are gone but another snapshot exists later in `(base, T]`, that snapshot's
state already includes the trimmed ops, so Component B starts there and replays only the retained tail.
Trimmed ops are never re-fetched; a later snapshot makes them unnecessary.

The target is only unreachable when all of the following hold: the nearest snapshot at or before `T` is
old, the ops between it and `T` have been trimmed, and no snapshot falls anywhere in between to bridge
the gap. In that case the exact state at `T` cannot be reconstructed, and Component B reports it
(for example, a `missing ops` / not-materializable outcome) rather than returning a wrong state — a
consumer may still choose to fall back to the nearest reachable state at or before `T`. This is rare in
practice because snapshots are written frequently relative to the op-retention window.

Note that `minimumSequenceNumber` is not the signal for any of this: it is the collaboration-window floor
baked into a snapshot, used when a snapshot is loaded, not an indicator of which ops the op stream still
retains. Op availability is determined by asking the op stream for the range, not by a version's minimum
sequence number.

### Should this be exposed through the container loader? (Component C)

Once Component B exists, a thin combining layer would construct the recomposed factory together with a
standard loader, letting callers request "load at sequence number N" directly. It depends only on
Component B's exposed factory, never on the version manager.

### Should there be an end-to-end test against a real ODSP file?

The fetcher is covered by stubbed-`fetch` integration tests, but not against a live file (which needs
tenant credentials). An end-to-end test would exercise the real endpoints.

### Should the raw driveItem `/content` download be a supported fallback?

The `/content` download also contains a version's snapshot, but wrapped in a container framing the
snapshot parser does not read directly. If the version-scoped snapshot endpoint is ever unavailable,
unwrapping `/content` could be a fallback path.
