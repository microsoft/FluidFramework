# Feature Libraries

Libraries which plug into the [Core Libraries](../core/README.md) to provide specializations, either for performance, or compatibility with specific tools or use-cases.

This includes concrete implementations of abstractions used to parameterize `SharedTreeCore` (Like `Index` and `ChangeFamily`), or any other entry points to the `core` libraries] package (like `Forest`).

`SharedTreeCore` should be usable with alternative versions of anything within this library.

Some important libraries in here:

-   [defaultFieldKinds](./defaultFieldKinds.ts): Definitions of FieldsKinds for schema.
-   [modular-schema](./modular-schema/README.md): Tools for working with documents using multiple FieldKinds, including a `change-family` and `ChangeRebaser` implementations.
-   [defaultChangeFamily](./defaultChangeFamily.ts): `modular-schema` powered `change-family` for `defaultFieldKinds`.
-   Families of changes/edits which can be applies for various field kinds
-   `ChangeRebaser` implementations for these change families
-   Implementations of Forest (Currently just [object-forest](./object-forest/README.md)).
-   `Index` summarizers, including [schemaSummarizer](./schemaSummarizer.ts), and [forestSummarizer](./forestSummarizer.ts).

## Future Plans

In the future, many more libraries may be added here.

Currently planned libraries for the near future include: (TODO: [roadmap](../../docs/roadmap.md) should have milestones which align with this.)

-   An optimized forest implementation which supports compressed chunks.
    -   Some compressed chunk formats to use with this forest.
-   A node identifier index for looking up nodes based on identifiers on the nodes.

Longer term there are many options (these are not all planned, and is not an exhaustive list):

-   More chunk formats: Optimize more common tree shapes (including identifiers, common types with dynamically sized children, sequences with variable width members like utf-8).
-   Schema importers: We will likely want at least one tool that takes input schema files and generates the types used by the schema libraries.
    Some options are listed here, but little thought has gone into this list:

    -   typescript DSL (like [TypeBox](https://www.npmjs.com/package/@sinclair/typebox)) that supports runtime and compile time typing without code gen.
    -   [json schema](https://json-schema.org/)
    -   graphQL

-   Schematize configurations:
    Likely the only schematize configuration we will want is one for use with `Schema` and `FlexTree`, but other options are possible.
    Likely will want optional fast path for when the `FlexTree` is backed by a `Forest` using shape based compression: may be able to skip some or all validation for whole subtrees this way.

-   Schematize Types: A typescript type-meta-function that subsets the `FlexTree` API to be schema aware (for both reading and editing)

-   Normalizers: Libraries to convert FlexTrees into representations ideal for use in specific frameworks/platforms/tool-kits. Like schematize, may have a fast-path for specific compressed data representations.

    -   react
    -   custom?

## Possible System / Service Configurations

Several different DDS setups can be made with these libraries.

For example, alfred (or some other service) could run a `Rebaser` sufficient to detect all conflicts, marking (or discarding) conflicted ops.
Such a service could also optionally enforce some validation or editing permissions.
Alternatively, conflict resolution can run fully client side.
A service could run a `Rebaser` that outputs a stream of tree diffs and saved tree snapshot summaries allowing lighter weight clients, and optionally granular read permissions.
Services could provide additional indexes (such as history or search).

Clients may or may not (depending on their `Rebaser` setup) be able to run with no actual copy of the tree in the DDS at all.

TODO: Enumerate some possible configurations and their motivations. Unify this with the list of use-cases below somehow.

## Use Cases

TODO: this section is just a collection of unorganized notes, and needs some work to be properly integrated into this document.

### Systems with existing data

There are a few different usage patterns for systems with existing data:

-   Import / Copy / Convert data into Fluid system. Maybe leave old one readonly.
-   Re-implement existing APIs / services / apps using Fluid for storage (can add Fluid as option and/or migrate data some at a time (ex: document level like whiteboard is doing), or migrate whole service).
-   Leave existing system as source of truth, and add optional Fluid front end with bidirectional sync.
-   Use Fluid as new source of truth, but support bidirectional sync to the other system.
-   Have an application that works with both existing data and Fluid data (may want to have compatible type/schema systems)

### Misc use-case

Large documents, partial view, permissions

indexing / external readonly copies: update them from deltas (or maybe from change sets?)

untrusted clients

trusted clients, small document minimal cost (currently Fluid)

offline editing -> merge

readers / platforms expecting specific formats (normalize)

demand for REST APIs, GraphQL. Read, maybe even modify. App specific?

encode / decode libraries or mapping to json (ex: namespace prefix / escaping)

pure json vs annotated json.

creating extra array nodes for sequences makes it hard to use?

autocad: xml

readers with schema: cover most use-cases

reserve some trait prefix

can generate json schema for reading data that was encoded to json without schema (can support either sequence everywhere or when only not 1 item)

pure json domain: contextual schema on read

pure json domain to schema on write.

json path

graphQl.

collab over existing datasets approaches:

-   import: access with new api
-   collab in-place
-   replace system, collab with same API
-   bidirection sync
-   ephemeral Fluid session then write back new data.

REST: https://www.redhat.com/en/topics/api/what-is-a-rest-api

rest: pure model: post data update: identity challenges

rest has collab issues

rest service: may rebase, may enforce schema

rest: document specific schema perf

cross document schema caching: hash -> rest service

rest: need partial view

rest: post vs put. Constraint to prevent concurrent edits. can express cancel of modified. Json patch. Reference identifier to diff against.

SOAP: https://www.redhat.com/en/topics/integration/whats-the-difference-between-soap-rest
