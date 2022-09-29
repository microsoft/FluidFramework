# Modules

There are a wide variety of use-cases for a Fluid tree, and there are several trade-offs in the design space that should be made differently for the different use-cases.
To enable flexibility both for how our users configure the system, as well as when we modify the implementation,
the implementation consist of collection of modules which can be composed in a few different ways to address a wide variety of use cases.

This breakdown is intended as an architectural approach to ensure we can deliver functionality in an incremental way (minimizing the work needed for the early milestones),
as well as quickly respond to specific feature requests, and perform targeted unit testing.

These module boundaries could optionally be publicly exported from packages (or be exposed as packages themselves),
allowing our consumers to also extend and configure the functionality in these ways (increasing our internal API stability obligations),
however that is a separate decision which is considered out of scope here.

## Core Libraries

These are some building blocks.
Names are not final.

| Module Name                 | Parameterized Over                                                                                                                                | Description                                                                                                                                                                                                               | Possible Features (Could be implemented, works without)                                                                                            | Depends on                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `tree`                      | Sequence type, Definition and Label Types                                                                                                         | Abstractions used for tree data models                                                                                                                                                                                    |                                                                                                                                                    |                                                           |
| `editable-tree`             | RootEditor                                                                                                                                        | Tree implementation allowing editing, compatible with `Schematize`                                                                                                                                                        |                                                                                                                                                    | `tree`                                                    |
| `forest`                    | Chunk Representations, Observers (ex: parents index, identifier identity index, external observers, change set builder?), Chunk Loader            | Store and edits in memory trees, notifies observers of changes                                                                                                                                                            | Partial trees (async loading subtrees). Copy On Write. Inline Storage of history information.                                                      | `tree`                                                    |
| `forest-accessors`          | Chunk Representations                                                                                                                             | Provides helpers for accessing forest as `Tree` and `EditableTree`                                                                                                                                                        |                                                                                                                                                    | `forest`,`editable-tree`                                  |
| `transaction`               | Specific Changeset / Edit Representation                                                                                                          | Provides transactionality and snapshot isolation. Produces Changesets which can be sent to a SharedTree.                                                                                                                  | Take in View Schema (which informs laziness boundaries for partial checkout) and applies Schematize with it to produce schematized EditiableTrees. | `editable-tree`,`forest`, `changeset`,`forest-accessors`  |
| `schema`                    |                                                                                                                                                   | Allows expressing type based constraints for tree nodes. Used by `view schema` and `stored schema`                                                                                                                        |                                                                                                                                                    |                                                           |
| `schematize`                | Schema System (ex: Schema), Tree Type (ex: EditableTree)                                                                                          | Handles differences between `stored schema` and `view schema` (schema on read)                                                                                                                                            |                                                                                                                                                    | `tree`                                                    |
| `editiable-tree-schematize` |                                                                                                                                                   | Configuration of Schematize to work on EditableTrees using Schema.                                                                                                                                                        |                                                                                                                                                    | `schematize`, `editable-tree`, `schema`                   |
| `changeset`                 |                                                                                                                                                   | Abstraction for change sets, and an implementation. Supports needs of `Rebaser`. Can be applied to Forests.                                                                                                               |                                                                                                                                                    | `forest`                                                  |
| `rebase`                    | Changeset Representation, State Tracker, Change Updater                                                                                           | Contains `Rebaser` which adjust a stream of edits to account for their original vs sequenced preceding state. This is just the rebase control loop and state-management: all the actual policy comes from its parameters. |                                                                                                                                                    | `changeset`                                               |
| `lazy-page-tree`            | Page user (DDS subclass which actually provides and reads the data)                                                                               | Abstract DDS providing incremental summarization and partial checkouts of pages of data.                                                                                                                                  | Global PageId to FluidHandle map (allows pages to refer to PageIds, which can have their data updated instead of directly by Fluid handle)         | Fluid's `SharedObject`                                    |
| `checkout`                  |                                                                                                                                                   | Can be subscribed to a SharedTree's Forest. Views Forest as EditableTree. Can create transactions.                                                                                                                        | Could be synchronous or async with respect to updates from the SharedTree (maybe react suspense style).                                            | `transaction`, `forest-accessors`                         |
| `shared-tree-core`          | Set of field kinds (includes ops for these kinds), history handling policy (keep none, keep main, keep timeline, keep branches), indexes, Rebaser | Extends LazyPageTree, manages collaboration window, updates indexes.                                                                                                                                                      |                                                                                                                                                    | `lazy-page-tree`, `forest`, `rebase`                      |
| `shared-tree`               |                                                                                                                                                   | Wrapper/Subclass for SharedTreeCore with more limited/controlled API surface. Likely wraps a Checkout, builds in the official/well supported ops and rebaser etc. Adds in Schematize if its not built into Checkout.      |                                                                                                                                                    | `shared-tree-core`, `checkout`, default Feature libraries |
| `history-optimizer`         |                                                                                                                                                   | Optional history optimizer. Re-encodes/optimizes history (Deduplicating, compression, indirection-removal, blobs size optimization etc). Converts history from optimized for writing to optimized for reading.            | Incremental Processing. Web-worker based multithreading. R-Tree style multi-dimensional index.                                                     |

## Feature Libraries

There are libraries which plug into the Core Libraries to provide specializations, either for performance, or compatibility with specific tools or use-cases.
Lists here are examples of options we could provide, and are not intended to be exhaustive, or all things that would be worth implementing.

-   Chunk Representations: Forest needs at least one chunk representation to actually store data. Several are provided for performance reasons:

    -   IndirectNode: Single node chunk. Most general. Supports all functionality (generally want to always include this one)
    -   UniformSequence: Highly compressed based on tree shape

-   Schema importers: We will likely want at least one tool that takes input schema files and generates the types used by the `Schema` library.
    Some options are listed here, but little thought has gone into this list:

    -   [json schema](https://json-schema.org/)
    -   graphQL
    -   typescript DSL (like [TypeBox](https://www.npmjs.com/package/@sinclair/typebox)) that supports runtime and compile type typing without code gen.

-   Schema libraries: We likely want to provide some useful schema, using and compatible with some importer (above):

    -   json (some way to embed json into our trees)
    -   xml
    -   primitives (somehow we need to express primitive types / values. This can be in the form of a schema library, which may or may not be special compared to normal schema libraries)

-   Schematize configurations:
    Likely the only schematize configuration we will want is one for using it with `Schema` and `EditableTree`, but other options are possible.
    Likely will want optional fast path for when the `EditableTree` is backed by a `Forest` using shape based compression: may be able to skip some or all validation for whole subtrees this way.

-   Schematize Types: A typescript type-meta-function that subsets the `EditableTree` API to be schema aware (for both reading and editing)

-   Normalizers: Libraries to convert EditableTrees into representations ideal for use in specific frameworks/platforms/tool-kits. Like schematize, may have a fast-path for specific compressed data representations.

    -   react
    -   custom?

-   Rebaser's Changeset Representations: There are a lot of different aspects to this

    -   Schema: There are several ways Changesets can deal with schema. A Changeset may support any combination of the below as additive constraints:
        -   Support constraints encoded in the edits, which the author of the changeset can use to ensure schema across merges (ex: parent of a node has not changed) (See "Change Tracker" below)
        -   Support operations that introduce schema into the document as data (collected/tracked by the state tracker), which can be used to validate data (ex: in the change updater)
        -   Support global/static/hard-coded schema: nothing is needed in the state tracker for these, but they could be applied/enforced just like ones it could track (ex: in the change updater)

-   Rebaser's State Trackers: tracks information the rebaser needs to update changes.
    May also track other information the user might want even if it isn't needed to do the change updating (ex: maybe they want to access the tree to interpret edits).
    May need to have their state written into DDS summaries. These are specific to particular Changeset implementations.

    -   Empty State Tracker: Tracks nothing.
    -   Tree State Tracker: Keeps a copy of the tree, applying changes as it goes. Uses `Forest`. If doing partial checkout, would sometimes need to lazily download new parts of the tree as they are modified.
    -   Change Tracker: Tracks what changes have happened in the collaboration window.
    -   Schema Tracker: Tracks the schema associated with the document (Only makes sense for change sets which can contain schema operations, like insert schema).

-   Rebaser's Change Updater: Each supports some set of field kinds.
    (Note that all of these can have a second variant that adds replay of higher level edits as an option to handle conflicts, or even as a first choice approach).

    -   Treeless Peer Rebase: Automatic, deterministic, performant does not require Tree State Tracker.
        Uses Schema Tracker and Change Tracker to update indexes in range traits, and conservatively mark conflicted when changes might interfere in ways it can't handle.
    -   Treeful Rebase: Automatic, deterministic, but requires Tree State Tracker.
        Can apply exact tree constraints. Save as above but conflicts in less cases by being less conservative.
    -   Out-of-line User Assisted: Same as Treeful Rebase, but allows user interaction to resolve conflicts.
        Useful for when a user explicitly initiates a merge between branches.

## Possible System / Service Configurations

Several different DDS setups can be made with these libraries.

For example, alfred (or some other service) could run a `Rebaser` with a `Change Tracker` sufficient to detect all conflicts, marking (or discarding) conflicted ops in its Change Updater.
Or conflict resolution can run fully client side.
A service could run a Rebaser with a Tree State Tracker that output a stream of tree Diffs and saved tree snapshot summaries.

Clients may or may not (depending on their `Rebaser` setup) be able to run with no actual copy of the tree in the DDS at all.

TODO: Enumerate some possible configurations and their motivations. Unify this with the list of use-cases below somehow.

## Use Cases

### Systems with existing data

There are a few different usage patterns for systems with existing data:

-   Import / Copy / Convert data into Fluid system. Maybe leave old one readonly.
-   Re-implement existing APIs / services / apps using Fluid for storage (can add Fluid as option and/or migrate data some at a time (ex: document level like whiteboard is doing), or migrate whole service).
-   Leave existing system as source of truth, and add optional Fluid front end with bidirectional sync.
-   Use Fluid as new source of truth, but support bidirectional sync to the other system.
-   Have an application that works with both existing data and Fluid data (may want to have compatible type/schema systems)

### Misc use-case nodes

Large documents, partial checkout, permissions

indexing / external readonly copies : from deltas (from change sets?)

bidirectional sync

untrusted clients

trusted clients, small document minimal cost (currently Fluid)

offline editing -> merge

readers / platforms expecting specific formats (normalize)

demand for rest APIs, GraphQL. Read, maybe even modify. App specific?

encode / decode libraries or mapping to json (ex: namespace prefix / escaping)

pure json vs annotated json.

creating extra array nodes for sequences makes it hard to use?

autocad: xml

readers with schema: cover most usecases

reserve some trait prefix

paul's email: json schema table

can generate json schema for reading data that was encoded to json without schema (can support either sequence everywhere or when only not 1 item)

pure json domain: contextual schema on read

pure json domain to schema on write.

rest: pure model: post data update: identity challanges

rest has collab issues

json path

rest service: may rebase, may enforce schema

rest: document specific schema perf

cross document schema caching: hash -> rest service

rest: need partial checkout

rest: post vs put. Constraint to prevent concurrent edits. can express cancel of modified. Json patch. Reference identifier to diff against.

graphQl.

go through calanders example from daniel

implement existing APIs or declare new ones:

can require custom adapter to implement existing ones

collab over exisring datasets:
import: access with new api
collan inpalce
replace system, collab withg same API

bidirection sync

Fluid component (in ffx) implement Datamodel: generate from schema? (How do they do schema changes?) FFX: release data-model a few weeks before you use it?

REST: https://www.redhat.com/en/topics/api/what-is-a-rest-api
SOAP: https://www.redhat.com/en/topics/integration/whats-the-difference-between-soap-rest

how common are id uses in editing now?

## WASM and Native Code

TODO: How does the desire to support native code, and/or wasm impact this?
