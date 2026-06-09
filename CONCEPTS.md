# Fluid Framework — Concepts

This is the **root of the engineering documentation tree**. It gives a high‑level,
conceptual tour of how the Fluid Framework is put together and links out to deeper
documents that live next to the code they describe.

The goal is a single, navigable starting point: read a short overview of a concept here,
then follow the link into the package/folder where that concept lives for the full detail.

> **How this tree works**
> Each top‑level concept below has a short "what & why" summary and a **Learn more** list of
> links. Overview docs live here at the root; detailed docs live in the relevant sub‑folder
> (e.g. summarization lives in `container-runtime`, end‑to‑end testing lives in `packages/test`).
> When you add a new doc deep in the repo, link it back up into the right section here so it
> stays reachable.

---

## Table of contents

- [Programming models](#programming-models) — encapsulated vs. declarative
- [Layers](#layers) — the four layers: Driver / Loader / Runtime / Datastore
- [Compatibility](#compatibility) — API, layer, cross‑client, and data‑at‑rest
- [Op processing](#op-processing) — batching, compression, chunking
- [Summarization](#summarization) — snapshots, the summarizer client, incremental summaries
- [Garbage collection](#garbage-collection) — mark / sweep of unreferenced objects
- [Testing](#testing) — unit, end‑to‑end, cross‑version, fuzz, and load testing

---

## Programming models

Fluid exposes two ways to build an application on top of the same runtime:

- **Encapsulated model** — your code packages data and logic into `DataObject`s that the
  container loads by code. Maximum flexibility and dynamic loading; more boilerplate.
- **Declarative model** — you describe a fixed schema of shared objects up front (e.g. via
  `SharedTree` / the `fluid-framework` container schema) and the framework wires it up. Simpler
  to consume; the shape is known at build time.

Understanding which model an application uses drives a lot of downstream behavior, including how
cross‑client compatibility is reasoned about.

**Learn more**

- [Application models](./ApplicationModels.md) — encapsulated vs. declarative, in depth

---

## Layers

A Fluid client is a stack of **four layers**, each with a defined contract to the layer above
and below:

| Layer | Responsibility | Made up of |
| ----- | -------------- | ---------- |
| **Driver** | Talks to a specific service (ODSP, Routerlicious/AFR, local). Sends/receives ops & snapshots. | the service drivers |
| **Loader** | Resolves and loads a container, manages the connection lifecycle. | the container loader |
| **Runtime** | Orchestrates data stores, op processing, summarization, and GC. | the **container runtime** |
| **Datastore** | The code+data units within a container and the shared data types that hold user data. | the **data store runtime** and the **DDSes** (SharedTree, SharedMap, sequences, …) |

Note the nesting: the **container runtime** belongs to the **Runtime** layer, while both the
**data store runtime** and the **DDSes** belong to the **Datastore** layer.

Layers are versioned and shipped independently, which is why **layer compatibility** is a
first‑class concern (see [Compatibility](#compatibility)).

**Learn more**

- [Layer compatibility](./LayerCompatibility.md) — how layer boundaries are validated
- [Layer compatibility dev guide](./LayerCompatibilityDevGuide.md)
- [`PACKAGES.md`](./PACKAGES.md) — the full package/layer listing enforced by `layer-check`

---

## Compatibility

Fluid ships many independently‑versioned packages and must keep documents and clients working
across versions. There are four distinct dimensions:

1. **API compatibility** — source/runtime compatibility of public APIs across releases.
2. **Layer compatibility** — a loader/driver/runtime of one version working with another.
3. **Cross‑client compatibility** — clients on different releases collaborating on the same
   document (an 18‑month window enforced via `minVersionForCollab`).
4. **Data‑at‑rest compatibility** — newer code reading summaries/snapshots written by older code.

**Learn more**

- [Compatibility considerations](./FluidCompatibilityConsiderations.md) — overview of all four dimensions
- [Layer compatibility](./LayerCompatibility.md) and its [dev guide](./LayerCompatibilityDevGuide.md)
- [Cross‑client compatibility](./CrossClientCompatibility.md) and its
  [dev guide](./CrossClientCompatibilityDevGuide.md)
- [Compatibility checkpoints](./CompatibilityCheckpoints.md) — the checkpoint schedule & version ranges

---

## Op processing

Every change in a Fluid document is an **operation** ("op"). The container runtime owns the
pipeline that gets ops to and from the ordering service efficiently:

- **Outbound:** ops are accumulated in an outbox, **grouped** into batches, optionally
  **compressed** (lz4), and **chunked** if they exceed the service's max message size.
- **Inbound:** received messages are de‑chunked, decompressed, and ungrouped before the runtime
  applies them, preserving batch and ordering guarantees.

This pipeline is what makes high‑frequency collaboration affordable.

**Learn more**

- [Op lifecycle & batching](./packages/runtime/container-runtime/src/opLifecycle/README.md) —
  grouping, compression, chunking, with end‑to‑end flow diagrams

---

## Summarization

The op log grows forever, but new clients shouldn't have to replay all of history. A
**summary** captures the state of a container at a sequence number so future clients can start
from there. Summaries are produced by a dedicated, non‑interactive **summarizer client** (elected
among connected write clients), generated on heuristics, and uploaded to storage and acked via
the ordering service. Summaries are **incremental** — unchanged subtrees are referenced by handle
rather than re‑uploaded.

**Learn more**

- [Summarization overview](./packages/runtime/container-runtime/src/summary/README.md) —
  what/why/who/when/how, the summary lifecycle, incremental summaries, resiliency
- [Summary & snapshot formats](./packages/runtime/container-runtime/src/summary/summaryFormats.md) —
  the on‑the‑wire tree formats
- [Writing tests that take summaries](./packages/test/test-end-to-end-tests/WritingTestsThatTakeSummaries.md) —
  how to test summarization deterministically

---

## Garbage collection

As a document evolves, objects (data stores, DDSes, blobs) can become **unreferenced**. Garbage
collection reclaims them in two phases: a continuous **mark** phase that walks the reference graph
to find unreferenced objects, and a **sweep** phase (integrated into the summary cycle) that
eventually deletes them. A **tombstone** mode sits in between to catch incorrect references safely
before deletion is enabled.

GC state travels inside the summary, so GC and summarization are tightly coupled.

**Learn more**

- [Garbage collection overview](./packages/runtime/container-runtime/src/gc/README.md) —
  mark/sweep, tombstones, session expiry, and configuration

---

## Testing

Fluid's correctness across services, versions, and time relies on several complementary test
styles: fast unit tests, **end‑to‑end** tests parameterized over drivers and version
combinations, **cross‑version/compat** testing, **fuzz/stochastic** testing for DDSes, **snapshot**
format compatibility tests, and **load** testing.

Tests are **not confined to one directory**: every package has its own unit tests (and optionally
fuzz tests) under `src/test`, while the cross‑cutting suites and shared infrastructure live in
[`packages/test`](./packages/test/README.md).

**Learn more**

- [Testing overview](./TESTING.md) — where each kind of test lives and how the pieces fit together

---

_This tree is a work in progress. Testing and Summarization are the first fully wired‑in
branches; other branches link to existing docs and will be expanded over time._
