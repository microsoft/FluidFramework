# Stored and View Schema

This document generally covers where we can store schema, and how they can be used, and not the specifics of what the schemas actually do.
Another way to put that is this is about what the Fluid tree needs from a schema system, and what options that leaves for how such a schema system could work,
and is not about how to use those options to actually build a schema system (and thus not what options the schema system exposes to application authors)

An example schema system is included which does take a position on exactly what the schema system could do, but its more intended as a demonstration of how a usable schema system could meet the requirements of view and stored schema as defined in this document, and not as a final design: it makes lots of subjective choices while the point of this document is to define the solution space.

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
    See `checkCompatibility` in [Schema.ts](./Schema.ts) for an example of how this could work.
-   Writers: When inserting new content, and updating modified nodes, share-tree can check them against the schema in the document.
    If the schema is missing, it must be added as part of the edit: for this the editing API needs to take in types which can have their desired stored schema queried.
-   Change application can access schema information: changes can conflict if they violate schema (or maybe only check at end of transaction? Or at special marked places and at end?).
    Change application could (someday) adjust behavior based on schema (ex: provide set semantics to a sequence) or have schema specific edits,
    but initial version will just detect violations and mark as conflicted.
-   We can ways to update existing schema:
    -   Could support OP that changes a schema in a way where all data that was accepted by the old schema is accepted by the new one (ex: add optional fields (if compatible with extra fields), move required field into extraFields, add a type to a field).
    -   Could even do things like apply a change to all nodes with a specific type to enable edits which modify a schema and update data atomically (ex: alter table like from sql). This does not work with partial checkouts well.

## Use as `View Schema`

-   Document load: The application can check that their view schema match stored schema, and check that the root has supported content.
    See `checkCompatibility` in [Schema.ts](./Schema.ts) for an example of how this could work.
-   Let app provide handlers/converters to adapt data that does not match the desired view schema (ex: support old formats), and apply them through Schematize.

## Design-pattern apps can use to handle schema migrations

To support making changes to schema used in existing documents:

If existing data will always be compatible with the new schema: (new schema permits a superset of what the old one did)

-   Author new more flexible schema with same type identifier.
-   Ensure app can properly handle documents containing the new format but does not switch documents to the new format.
    There are a few approaches: (TODO: we should pick one of these, and document how to actually do it cleanly)
    -   Use new schema as the view schema, and be careful when editing.
    -   Have the app support both view schema (new and old):
        have schematize pick which to use based on which is the stored schema.
    -   Make which format is written for new content conditional on a flag (which opts into creating data that needs new format).
        Initialize this flag based on if the new schema is compatible with the stored schema.
-   Wait for above to be deployed to most users.
-   Update or configure app such that it writes the new schema to the document's stored schema, and starts thus using the new functionality that enables.

If existing data could be incompatible with the new schema:

-   Author new schema (with a new type identifier)
-   Add support for it in the application.
    This may optionally be done by using the new schema as the view schema (removing the old one), and providing schematize with a handler to do the update/conversion.
-   Recurse this algorithm updating the parent to accept the new schema (which in most cases will hit the "If existing data is compatible with the new schema" case.)

### Schema Versioning

This migration strategy results in two kinds of changes to schema:

1. An updated copy of a schema new schema with a new type identifier.
2. An updated copy of a schema with the same type identifier (and tolerates strictly more trees that the old version).

In both of these cases, the keeping the old schema around in the application source code is useful, but in different ways.
This section covers a pattern for managing this such that applications are able to efficiently manage all these which accumulate over time,
meaning that we do not place any O(number of old schema) complexity into any code.

Old schema in case #2 only need to be kept until the migration is complete, meaning deployed application are allow to write the new more flexible format.
During the migration, both can be kept, and a test can be used to confirm that the new schema actually permits a superset of what the old one did.
Once the migration is done, all code depending on the old schema can be deleted (which should just be the old schema itself, support for creating data in that format when inserting it into the document, and the above mentioned test).
The two schema could be kept strait by calling them `*CompatibilitySchema` and `*Schema` respectively.
It would also be possible to express the new one a a declarative upgrade to the old one (via a set of relaxations to parts of it), and then replace it with a normally coded one (not based on the old one) when deleting the old one.

Old schema in case #1 has much longer term implications: they need to live forever to support old documents.
In this case, the schema have different identifiers, which could either be random (ex: UUID), or a developer friendly name including a version.
The old schema, and handlers which can upgrade the data to the new format, get packed into a library which can be loaded into schematize to provide legacy schema support.
The old schema will not need to be mentioned anywhere else in source code (it may be mentioned in documents though!).

### Schema Migration examples

As we don't have a schema language yet, consider this schema Pseudocode.

If we start with:

```typescript
// We need some way to express the unique identifiers. Just going to add them after the name for the API for now, and use versions not UUIDs for this example.
Canvas:CanvasV1{
    items: Circle | Point
}

Circle:CircleV1{
    center: Point
    radius: number
}

Point:PointV1{
    x: number
    y: number
}
```

Then update this doing the desired schema change.
This is our new view schema:

```typescript
Canvas:CanvasV1{
    items: Circle | Point // Note this implicitly refers to CircleV2 now.
}

Circle:CircleV2{
    center: Point
    diameter: number // Changed from radius
}

Point:PointV1{
    x: number
    y: number
}
```

To enable support for legacy documents we separately package

```typescript
// The original canvas schema, moved/renamed out of the way (Case #2 above: kept until migration is finished).
// TODO: details on how we se this during the migration to avoid premature format updates before rollout is complete.
CanvasCompatibility:CanvasV1{
    items: CircleV1 | Point
}

// The original circle schema, moved/renamed out of the way (Case #1 above: kept forever)
CircleV1:CircleV1{
    center: Point
    radius: number
}
```

And with CircleV1, we provide an adapter for use with schematize that can handle a CircleV1 when a Circle (aka Circlev2) is expected.

## Open questions in proposed design

### How should we deal with transient out of schema states while editing?

Use edit primitives that avoid this? (ex: swap instead of delete and insert. Maybe a version od detach that inserts a placeholder which has to be replaced with valid data before the transaction ends? That seems like it could make the tree reading API for the middle of transactions messy.)

### What to do with TreeSchema.extraGlobalFields?

Should TreeSchema.extraGlobalFields exist, and if not, should be be unconditionally on or off? (See its doc comment).

### Do we need bounded open polymorphism?

Definitions for adjectives used with polymorphism:

-   unbounded: all types/values are permitted.
-   bounded: constrained by something (ex: an explicit list of types, a structural interface type (like a typescript or Go interface), a nominal interface (which the type must declare it implements, like a java interface or typescript class with protected members))
-   open: does not require modifying the declaration of the field to create a new type which can be used in it.
-   closed: requires modifying the declaration of the field to create a new type which can be used in it.

The example schema system includes bounded closed polymorphism (via unions in fields), and unbounded open polymorphism (via fields with unconstrained types).
It however does not support bounded open polymorphism.
If support for bounded open polymorphism was added, it would done my modifying FieldSchema.type: see its doc comment for details.

There are a few reasons to leave bounded open polymorphism out of initial versions:

-   it is possible to add in the future without breaking existing documents and could be incrementally adopted in new and updated schema.
    Thus there is little cost to delaying its implementation.
-   there are several ways it could be implemented.
    This means we will have to make some design decisions which will take time, and might be able to make better informed later.
-   it complicates the implementation, requiring time to test and implement.

## Approaches for bounded open polymorphism

Despite these reasons to delay worrying about it, it is worth outlining some of the approaches which are practical to make sure they are sufficient to handle the desired use-cases:
deciding which of these approaches we actually want is a separate issue.

Before listing the approaches, its important to note what we really care about is enabling applications to do bounded open polymorphism.
This distinction is important for 2 reasons:

1. Applications may want to constrain the types based on what the application can do with the types, not the structural shape of their data (ex: canvas might want to limit its children to things the app has code to draw, not things that have some particular fields, like a top left point).
2. There are some ways we can implement bounded open polymorphism like patterns at the app level without requiring direct support in the schema system.

Some approaches for bounded open polymorphism at the applications level:

-   Build view schema with a closed set of types on app load or build:
    The application can compute a closed set of types which meet it's requirements
    (which can be structural (ex: require specific fields), nominal (specific types opt in to some named set of types they want to be included in) and/or behavioral (all types supporting some specific functionality/[behavior](https://en.wikipedia.org/wiki/Aspect-oriented_programming))).
    This can be used to programmatically construct a schema using closed polymorphism while exposing it as open polymorphism to the application authors/schema language.
    This has the issue that different applications might come up with different sets of types, so this approach is mainly suitable for view schema.
    There are a few options for how to handle the stored schema (listed below)
    Note that all these approaches potentially have to deal with cases where the app's view schema does not match the stored schema.
    If one group controls all the apps and the versions of them in use, its possible to ensure that all apps support all types that will occur in the stored schema, and tooling could be made fore this (ex: generate the set of types as a build step, check in the results and ensure it only grows, then be careful with version roll-outs to roll out view support for types before versions that insert them).
    -   initially use the same schema used for view. Update later (ex: when a different app performs an edit inserting something the first app doesn't support)
    -   just list the minimal set of types actually used in the document in that field, and update the field schema to allow new types when needed used.
    -   use open polymorphism
-   The above, but hand code the type lists.
    It should be possible to get build errors if you don't update it, so this should be practical if all allowed types are statically known when building the app (ex: no dynamically loaded plugins that add extra types)
-   Use open polymorphism in the stored and view schema: handle unexpected values in the app.
-   Build a nominal open polymorphism system into the schema, allowing types to explicitly declare they are a member of a particular typeset/interface.
    Compatibility between stored and view schema can include checking these align.
-   Add a structural constraints that can be applied to field's children.
    There are a few design choices for this:
    -   How deep does it go?
        -   Allow constraints to apply further constraints on the children recursively.
        -   Allow only constraining the immediate children beyond the constraints their type implies.
    -   Are the constraints applied to types or values?
        -   Types: compute, based only on the schema, which types are allowed under which constraints.
            This only permits types where all possible values meet the constraints. `allowsTreeSuperset` can compute if a type is allowed.
        -   Values: compute, based only on the value, if its allowed under which constraints.
            For example a type with an optional field could be placed under a constraint which required it, if the particular instance of the value had the field.
            This adds more `context` (same tree might be valid in one place and invalid in another due to these constraints).
            This would be difficult to support as stored schema due to needing to reject edits that are in schema for the type, but violate a structural constraint.
            Making this work soundly when combined with concurrent moves which change which structural constraints apply would be hard.

## Inheritance Notes

Inheritance is a conflation of a specific kind of nominal bounded open polymorphism with reuse of implementation/declaration for some common parts of the types.
These aspects can be separated, allowing for a more flexible system than one based on inheritance.

Inheritance is sometimes useful for concisely expressing specific types:
we can gain this benefit by we can implementing it as is syntactic sugar for some reuse mechanism
(ex: a way to include fields from another type or standalone set of fields) combined with some bounded open polymorphism mechanism (pick from the above approaches).

# Schedule

What work we need to do for each milestone in #8273

## M0

This document.

## M1

The architecture should account for this document and near and long term ideas.

## M2

Review and polish `Design-pattern apps can use to handle schema migrations`, including actual APIs, documentation and examples so apps can start planning forward compatibility for documents.

Pick concrete answers for the flexible ares in the design that need to be nailed down for document compatibility.
This includes how values/primitives work and what our initial set of primitives types will be.

## M2 or M3

Implement enough functionality to perform the steps in the above design pattern.

## M3

Polish up and finalize schema language, schema aware APIs, and make sure APIs are statically typed and result in data staying in schema (including fuzz testing, and maybe some proofs).

## Sometime after M3

Schema/Shape optimized storage formats, and optimize schematize for these formats and for known stored schema.

Support additional functionality (prioritize based on users). Some examples we might do:

-   other options for stored schema
-   imperative extensions to view schema
-   more specific multiplicity options
-   helpers for schema migrations
-   support and/or helpers for bounded open polymorphism.
-   allow metadata for app use in view (and maybe stored) schema
-   default values:
    -   Maybe default values in stored schema can make schema migrations more flexible (ex: adding value fields), and provide a hint for compression.
    -   Maybe default values in view schema can provide a API like value fields, but for fields stored as optional? What about defaults for sequences?
    -   Maybe as a special case ort usage or a more general constants system?
-   helpers and patterns for enums

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

## Reuse and Polymorphism

This document generally covers where we can store, and how they can be used, and not the specifics of what the schemas actually do.
Another way to put that is this is about what the Fluid tree needs from a schema system, and what options that leaves for how such a schema system could work,
and is not about how to use those options to actually build a schema system.
