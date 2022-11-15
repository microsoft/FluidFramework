# Stored and View Schema Options

This document generally covers where we can store schemas, and how they can be used, and not the specifics of what the schemas actually do.
Another way to put that is this is about what the Fluid tree needs from a schema system, and what options that leaves for how such a schema system could work.
There is a [separate document](./Stored%20and%20View%20Schema.md) covering the specific approach currently being taken for Tree.

# Definitions

-   `stored data` : data stored in the Fluid container by the tree DDS.
-   `stored schema` : a set of constraints it is valid to assume the `stored data` meets, and that must be maintained when editing (including through conflicts) by the tree DDS itself.
    All users of the tree must agree on this if they are editors.
    Any changes to this must be sequenced as Fluid ops.
    Generally implemented by storing schema information (or references to immutable publicly available schema information) in the tree DDS itself.
-   `view schema` : a set of constraints the application wants the data to conform with when viewing/reading it.
    Different clients may have differing view schema, even at the same time e.g. due to multiple apps using the same document, or different versions of an app during a rollout.
    Restrictions on how to stage/manage changes to view schema may vary from app to app e.g. some apps could update all clients concurrently, some could use document semantic versions, and some could just rely on best effort schema on read.
-   `context` : information about the location in the tree that adjust the constraints on what is valid there.
    For example, if looking at a node in a trait, that trait may provide the context that only a specific list of types are allowed, or that additional nodes can't be added to that trait.
    More complex context dependent schema, for example that a node of a particular type in one location in the app permits different children that it does elsewhere, can cause maintaining schema to be hard during merges.
    While nothing in this document (other than the specific example schema system) restricts what could be used in the context, we will assume that non-local context based constraints
    (ex: everything other than a type putting rules on what can go immediately under that type, and do not depend on its parent) will not be included, at least initially.
    Such systems (for example parametric types) can be added later if desired.

# The Design Space

This section enumerates possible options.

## Places we can store stored schema information

There are several ways to express 'stored schema'.

Places we can store stored schema information:

-   Inline in whatever place is referring to it (see list below)
-   As stored data
-   Hard coded into the shared-tree DDS (constraints like the tree being a tree instead of a DAG fall into this)
-   Injected via a shared-tree subclass or other Fluid configuration (schema data / constraints shipped as code)
-   In some external repository: the repository defines an append only namespace of schema
    This repository is known about by shared-tree somehow (any of the other items in this list could contain the reference to the repository)

## Places that can refer to/apply stored schema:

-   At the root (ex: shared-tree, a subclass, or its configuration), which can be special cased to apply some rules, possibly recursively, to the root.
-   Declaratively on nodes of a specific type: Nodes in the tree are typed, so similar to the above, the tree can be configured to apply specific schema based on type of the nodes.

    This forces all nodes of the same type to have the same schema: it's not contextual but easily handles open polymorphism (ex: a child that's allowed to be anything as long as it's in schema for its type).

-   In other schema: For example, a schema can apply specific schema to its children.

    This allows for `contextual schema` (under one parent the same type might have different rules compared to under another parent).

Note that it's possible to refer to schema in a way that's unambiguous, but code handling the data might not always have the schema.
For example, document could refer to a schema by its hash, or name in an append only namespace.
This can have interesting implications for updates to new schema (ex: one client adds data using a schema shipped as code that another client does not have).
Some of the options do not have this issue (inline, central repository (assuming you are ok going down if it goes down and schema are not cached), and in stored data).

# Options to Support

That's a lot of options all of which have use-cases. Long term, at least basic support for all of them may make sense but a much smaller subset can be supported initially while supporting most use-cases pretty well.

Requirements for this initial version should include:

-   Make adoption of different constraint/schema systems optional and incremental: all of these different options should be opt in, and easy to add to and existing application if desired.
-   Provide a schema-on-read system (ex: schematize) that can give an application a nice interface to the data, including validation and error handling.

    Anytime the view schema and stored schema are different, this can allow the app to function as well as possible (detect and handle out of schema data, both on read and on edit, as localized as permitted by the provided error handlers).

-   Provide at least one way to customize the stored schema (schema-on-write), which can at least do type based constraints.
-   Have at least one good design pattern that apps can use to handle schema migrations for each method they use to enforce/specify schema (make sure this supports a roll out process where clients have mixed code versions and old documents will be supportable forever).

# Expected Usage Patterns

I suspect most data will be handled in one of the two following approaches:

-   pure schema-on-read: no customization of stored schema
-   almost pure schema-on-write: only using schema-on-read to assist with schema migration so their view schema doesn't have to deal with old formats (which unavoidably pile up in the stored schema).

    They may additionally use schema-on-read to enforce/fix some invariants the stored schema system isn't expressive enough to declare (referential integrity for graph-like references, numeric ranges, and any other application level invariants that are desired)

Note that while many apps might do mostly one or the other, a reasonable design pattern is to take one approach for some data, and the other approach for the rest.
For example, the core parts of a document might take a schema-on-write approach but allow extensible metadata that is handled with schema-on-read. This is a great place for different applications using the same document to store their data if they want to be less formal about versioning, and do best effort interop with each other's metadata.

# Misc Notes

## Schema DDS

The stored schema could be in its own DDS.
This would be particularly practical if we add a way (or find a pattern) for DDS_s to perform cross DDS transactions.
Maybe the tree DDS could be optionally configured with a schema DDS which it uses for stored schema (could allow sharing schema between documents).
Readonly (for most people) public schema documents would compose interestingly with this.

Even if we can't make it work as a separate DDS, it should be implemented such that it would be easy to reuse the code as a schema-DDS.

## Typescript Typing

It is be possible to have an embedded DSL for schema declaration in the style of [typebox](https://www.npmjs.com/package/@sinclair/typebox) which produces both compile time types and runtime schema data.
This allows for schema-aware APIs (for example for tree reading and editing) to be provided without code gen.

It's possible to take this schema-aware static typing much further though (but it may not be useful to do so).

This static typing could be used to provide:

-   A SchemaRegistry that also collects runtime and compile type data.
-   Type safe APIs for schema updates e.g. updating a stored schema gives back a new schema repository that includes the changes.
-   Ways to type document load/viewing e.g. provide an expected stored schema with the document, and type check that the view supports it, optionally including strongly typed handles/adapters/reencoders for schematize.

Regardless of the typescript typing, the stored schema can be checked against the view schema to skip schematize where possible.
Schema-supersettting can be also used to determine if a schema is safe for reading but not writing.

## Reuse and Polymorphism

This document generally covers where schemas can be stored and how they can be used, and not the specifics of what they actually do.

Another way to put that is this is about what the Fluid tree needs from a schema system, and what options that leaves for how such a schema system could work,
and not about how to use those options to actually build a schema system.

## Ways to update existing schema:

-   Could support op that changes a schema in a way where all data that was accepted by the old schema is accepted by the new one (ex: add optional fields (if compatible with extra fields), move required field into extraFields, add a type to a field).
-   Could even do things like apply a change to all nodes with a specific type to enable edits which modify a schema and update data atomically (ex: alter table like from sql). This does not work with partial checkouts well.
