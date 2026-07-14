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
minimizes the chance that the needed ops have been trimmed from retention. So selection returns the
greatest version sequence number that is still less than or equal to the target.

### How is a version's sequence number obtained?

By fetching that version's snapshot from the **version-scoped snapshot endpoint**
(`.../versions/{label}/opStream/snapshots/trees/latest?blobs=2`), which returns the snapshot in the
driver's normal (`application/json` or `application/ms-fluid`) framing. The driver's existing snapshot
parser reads it, and the sequence number is `trees[0].sequenceNumber`. `blobs=2` inlines blob contents
so the parser has everything it needs.

### What is `minimumSequenceNumber`, and is it used for selection?

It is the collaboration-window floor at a version (the point below which ops may be trimmed). It is
carried on `ResolvedVersion` when read, but it is **not** an input to base selection — a version is a
single point at its `sequenceNumber`, not a range.

### What is deliberately not built here?

Loading the base and replaying ops to the exact target (Component B), the loader hookup (Component C),
and any test against a live ODSP file. See [Part IV](#part-iv--directional).

## Part II — The Version Manager

`OdspVersionManager` selects the base version. It depends on an injected `IOdspFileVersionFetcher`, so
these behaviors are tested with an in-memory fake.

### Which version does `findBaseForSeq` pick for a target sequence number?

The list is newest-first, and the tip (index 0, the live document) is not a base candidate. Among the
remaining versions, the answer is the greatest sequence number less than or equal to the target.

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
- **Stale caches?** `refresh()` drops them so the next query re-enumerates. `M-CACHE-02`

### What happens when a version cannot be resolved?

The failure propagates; it is never swallowed into a wrong base. `M-ERR-01`

### What does `listVersions` return?

Every version with its resolved sequence number, newest-first. `M-LIST-01`

## Part III — The File-Version Fetcher

`createOdspFileVersionFetcher` is the real `IOdspFileVersionFetcher`, talking to ODSP. Its behaviors
are tested against a stubbed `fetch` that returns canned responses through the real request,
authentication, and snapshot-parsing code.

### How does it enumerate versions?

It calls the driveItem versions URL — built from the same API root as the snapshot call — and maps
the `value` array to versions (newest-first). `F-LIST-01`

### How does it resolve a version's sequence number?

- **A well-formed snapshot?** It calls the version-scoped snapshot URL (`.../versions/{label}/opStream/snapshots/trees/latest?blobs=2`),
  parses the response, and returns `trees[0].sequenceNumber`. `F-RESOLVE-01`
- **A snapshot with no sequence number?** It throws, naming the version, rather than returning a wrong
  value. `F-RESOLVE-02`

## Part IV — Directional

Aspirational behaviors, written as questions that cannot yet be answered "yes".

### Should sequence-number resolution be lazy or binary-search, rather than eager?

Resolving each version costs one snapshot fetch. With up to ~50 versions, an eager newest-to-oldest
scan can fetch more than necessary. The public contract (`findBaseForSeq`) already hides the strategy,
so a binary search over versions could replace it without changing callers.

### Should there be a component that loads the base and replays ops to the exact target? (Component B)

The manager only chooses the base. Materializing the document at an arbitrary target requires loading
that version read-only and replaying the ops between the base and the target — sourcing later ops from
the live op stream when the historical range has been trimmed.

### Should this be exposed through the container loader? (Component C)

Once Component B exists, a loader-facing entry point would let callers request "load at sequence
number N" directly.

### Should there be an end-to-end test against a real ODSP file?

The fetcher is covered by stubbed-`fetch` integration tests, but not against a live file (which needs
tenant credentials). An end-to-end test would exercise the real endpoints.

### Should the raw driveItem `/content` download be a supported fallback?

The `/content` download also contains a version's snapshot, but wrapped in a container framing the
snapshot parser does not read directly. If the version-scoped snapshot endpoint is ever unavailable,
unwrapping `/content` could be a fallback path.
