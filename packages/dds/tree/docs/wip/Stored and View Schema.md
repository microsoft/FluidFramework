# Stored and View Schema

# Definitions

-   `stored data` : data stored in the Fluid container by the tree dds.
-   `stored schema` : a set of constraints it is valid to assume the `stored data` meets, and that must be maintained when editing (including through conflicts) by the tree dds itself.
    All users of the tree must agree on this if they are editors.
    Any changes to this must be sequenced as Fluid ops.
    Generally implemented by storing schema information (or references to immutable publicly available schema information) in the tree dds itself.
-   `view schema` : a set of constraints the application wants the data to conform with when viewing/reading it.
    Different clients may have differing view schema, even at the same time (ex: due to multiple apps using the same document, or different versions of an app during a rollout):
    restrictions on how to stage/manage changes to view schema may vary from app to app (ex: some apps could update all clients concurrently, some could use document semantic versions, some could just rely on best effort schema on read)
-   `context` : information about the location in the tree that adjust the constraints on what is valid there.
    For example, if looking at a node in a trait, that trait may provide the context that only a specific list of types are allowed, or that additional nodes can't be added to that trait.
    More complex context dependent schema, for example that a node of a particular type in one location in the app permits different children that it does elsewhere, can cause maintaining schema to be hard during merges.
    While nothing in this document (other than the specific example schema system) restricts what could be used in the context, we will assume that non-local context based constraints
    (ex: everything other than a type putting rules on what can go immediately under that type, and do not depend on its parent) will not be included, at least initially.
    Such systems (for example parametric types) can be added later if desired.

# The Design Space

This section enumerates possible options.

## Places we can store stored schema information

There are several ways to express 'stored schema'

Places we can store stored schema information:

-   Inline in whatever place is referring to it (see list below)
-   As stored data
-   Hard coded into shared tree (constraints like the tree being a tree not a DAG fall into this)
-   Injected via a shared-tree subclass or other Fluid configuration (schema data / constraints shipped as code)
-   In some external repository: the repository defines an append only namespace of schema
    This repository is known about by shared-tree somehow (any of the other items in this list could contain the reference to the repository)

## Places that can refer to/apply stored schema:

-   Code can special case the root (ex: shared-tree, a subclass, or its configuration, can apply some rules, possibly recursively, to the root).
-   Declaratively for a specific type: nodes in the tree are typed, so similar to the above, the tree can be configured to apply specific schema based on type of the nodes.
    This forces all nodes of the same type to have these same schema: its not contextual, but easily handles open polymorphism (ex: a child thats allowed to be anything, as long as its in schema for its type).
-   In other schema: for example, a schema can apply specific schema to its children.
    This allows for `contextual schema` (under one parent the same type might have different rules compared to under another parent).

Note that its possible to refer to schema in a way that's unambiguous, but code handing the data might not always have the schema.
For example document could refer to a schema by its hash, or name in a append only namespace.
This can have interesting implications for updates to new schema (ex: one client adds data using a schema shipped as code that another client does not have).
Some of the options do not have this issue (inline, central repository (assuming you are ok going down if it goes down and schema are not cached), and in stored data).

# What options to support.

Thats a lot of options, and I think there are good reasons for all of them, so long term, we likely want all of them to be options to some extent.
But I think we can pick a good subset for the now, and leave open the option of extending it in the future.

I think we want to at least:

-   Make adoption of different constraint/schema systems optional and incremental: all of these different options should be opt in, and easy to add to and existing application if desired.
-   Provide a schema-on-read system (ex: schematize) that can give an application a nice interface to the data, including validation and error handling
    Anytime the view schema and stored schema are different, this can allow the app to function as well as possible (detect and handle out of schema data, both on read and on edit, as localized as permitted by the provided error handlers).
-   Provide at least one way to customize the stored schema (schema-on-write), which can at least do type based constraints.
-   Have at least one good design-pattern apps can use to handle schema migrations for each way they have to enforce/specify schema (make sure this supports a roll out process were clients have mixed code versions, and old documents will be supportable forever)

# Expected usage patterns

I suspect most data will be handled in one of the two following approaches:

-   pure schema-on-read: no customization of stored schema.
-   almost pure schema-on-write: only using schema-on-read to assist with schema migration so their view schema doesn't have to deal with old formats (which unavoidably pile up in the stored schema)
    They may additionally use schema-on-read to enforce/fix some invariants the stored schema system isn't expressive enough to declare (referential integrity for graph like references, numeric ranges, and any other appellation level invariants that are desired)

Note that while many apps might do mostly one or the other, a reasonable design pattern is take one approach for some data, and the other approach for the rest.
For example the core parts of a document might take a schema on write approach, but allow extensible metadata that is handled with schema on read
(which is a great place for different applications using the same document to store their data if they want to be less formal about versioning, and do best effort interop with each-other's metadata).

# Example/Proposed Design

This design shows an easy to implement MVP, and is not intended to have document or API compatibility with what we do longer term.
It minimally implements the requirements from "What options to support" while being extensible in the future.
It can be subsetted for use in earlier milestones, and could be extended for later ones, see "Schedule" below.

This design is intentionally minimal while still being useful.
Features not needed for minimal strongly typed application use or the JSON and XML domain schema are not included.

## Schema Representation

The MVP should include a simple schema system, usable as a MVP for both `stored schema` and `view schema`.

One possible such schema system is included in [Schema.ts](./Schema.ts).

These `TreeSchema` and `FieldSchema` can be added as `stored schema` as part of an edit op,
which is considered conflicted if it tries to add a type that has a conflicting `name` and is not equal to the existing one.

While a schema must be added to the document as a stored schema to use the type
(otherwise adding a new type could break existing data which might not even be downloaded on the current client),
it's possible to add a schema that is compatible with all possible data (assuming the children themselves are compatible with their own types).
Applications which wish to rely entirely on schema-on-read for some or all of their data can use this pattern for all `stored schema` and only use their actual developer authored schema as `view schema`:

## Use as `Stored Schema`

-   Document load: The application can check that their view schema match stored schema, and check that the root has supported content.
-   Writers: When inserting new content, and updating modified nodes, share-tree can check them against the schema in the document.
    If the schema is missing, it must be added as part of the edit: for this the editing API needs to take in types which can have their desired stored schema queried.
-   Change application can access schema information: changes can conflict if they violate schema (or maybe only check at end of transaction? Or at special marked places and at end?).
    Change application could (someday) adjust behavior based on schema (ex: provide set semantics to a sequence) or have schema specific edits,
    but initial version will just detect violations and mark as conflicted.
-   We can ways to update existing schema:
    -   Could support OP that changes a schema in a way where all data that was accepted by the old schema is accepted by the new one (ex: add optional fields (if compatible with extra fields), move required field into extraFields, add a type to a field).
    -   Could even do things like apply a change to all nodes with a specific type to enable edits which modify a schema and update data atomically (ex: alter table like from sql). THis does not work with partial checkouts well.

## Use as `View Schema`

-   Document load: The application can check that their view schema match stored schema, and check that the root has supported content.
-   Let app provide handlers/converters to adapt data that does not match the desired view schema (ex: support old formats), and apply them through Schematize.

## Design-pattern apps can use to handle schema migrations

If existing will always be compatible with the new schema: (new schema permits a superset of what the old one did)

    - Author new more flexible schema.
    Use this as applications schema for reading.
    Make which format is written conditional on a flag (which opts into creating data that needs new format).
    Initialize this flag based on if the new schema is written to the document's schema list.
    - Wait for above to be deployed to most users.
    - Update or configure app such that it writes the new schema to the document's schema list.

If existing data could be incompatible with the new schema:

    - Author new schema.
    - Add support for it in the application.
    This may optionally be done by using the new schema as the view schema (removing the old one), and providing schematize with a handler to do the update/conversion.
    - Recurse this algorithm updating the parent to accept the new schema (which in most cases will hit the "If existing data is compatible with the new schema" case.)

# Schedule

What work we need to do for each milestone in #8273

## M0

This document.

## M1

The architecture should account for this document and near and long term ideas.

## M2

Review and polish `Design-pattern apps can use to handle schema migrations`, including actual APIs, documentation and examples so apps can start planning forward compatibility for documents.

## M2 or M3

Implement enough functionality to perform the steps in the above design pattern.

## M3

Polish up and finalize schema language, schema aware APIs, and make sure APIs are statically typed and result in data staying in schema (including fuzz testing, and maybe some proofs).

## Sometime after M3

Schema/Shape optimized storage formats, and optimize schematize for these formats and for known stored schema.

Support additional functionality (other options for stored schema, imperative extensions to view schema)

# Misc Notes

## Schema DDS

The stored schema could be in its own DDS.
This would be particularly practical we add a way (or find a pattern for) for DDS_s to perform cross DDS transactions.
Maybe the tree DDS could be optionally configured with a schema DDS which it uses for stored schema (could allow sharing schema between documents).
Readonly (for most people) public schema documents would compose interestingly with this.

Even if we can't make it work as a separate DDS, it should be implemented such that it would be easy to reuse the code as a schema-dds.

## Typescript Typing

It is be possible to have an embedded DSL for schema declaration in the style of [typebox](https://www.npmjs.com/package/@sinclair/typebox) which produces both compile time types and runtime schema data.
This allows for schema aware apis (for example for tree reading and editing) to be provided without code gen.

Its possible to take this schema aware static typing much further though (but it may not be useful to do so).
This static typing could be used to provide:

-   A SchemaRegistry that also collects runtime and compile type data.
-   Type safe APIs for schema updates (updating a stored schema gives back a new schema repository that includes the changes).
-   Ways to type document load/viewing (ex: provide an expected stored schema with the document, and type check that the view supports it, optionally including strongly typed handles/adapters/reencoders for schematize)

Regardless of the typescript typing, the stored schema can be checked against the view schema to skip schematize where possible.
Schema-supersettting can be also used to determine if a schema is safe for reading but not writing.
