# Container and Application Schema

# Definitions

-   `container data` : data stored in the Fluid container by the shared tree dds.
-   `container schema` : a set of constraints it is valid to assume the `container data` meets, and that must be maintained when editing (including through conflicts)
    All users of the container must agree on this if they are editors
    Any changes to this must be sequenced as Fluid ops.
-   `application schema` : a set of constraints the application wants to make about the data
    Different clients may have differing application schema, even at the same time (ex: due to multiple apps using the same document, or different versions of an app during a rollout): restrictions on how to stage/manage changes to application schema may vary from app to app (ex: some apps could update all clients concurrently, some could use document semantic versions, some could just rely on best effort schema on read)

# The Design Space

This section enumerates possible options.

## Places we can store container schema information

There are several ways to express 'container schema'

Places we can store container schema information:

-   Inline in whatever place is referring to it (see list below)
-   As container data
-   Hard coded into shared tree (constraints like the tree being a tree not a DAG fall into this)
-   Injected via a shared-tree subclass or other Fluid configuration (schema data / constraints shipped as code)
-   In some external repository: the repository defines an append only namespace of schema
    This repository is known about by shared-tree somehow (any of the other items in this list could contain the reference to the repository)

## Places that can refer to/apply container schema:

-   Code can special case the root (ex: shared-tree, a subclass, or its configuration, can apply some rules, possibly recursively, to the root)
-   Declaratively for a specific type: nodes in the tree are typed, so similar to the above, the tree can be configured to apply specific schema based on type of the nodes
    This forces all nodes of the same type to have these same schema: its not contextual, but easily handles open polymorphism (ex: a child thats allowed to be anything, as long as its in schema for its type)
-   In other schema: for example, a schema can apply specific schema to its children
    This allows for `contextual schema` (under one parent the same type might have different rules compared to under another parent)

Note that its possible to refer to schema in a way that's unambiguous, but code handing the data might not always have the schema.
For example document could refer to a schema by its hash, or name in a append only namespace.
This can have interesting implications for updates to new schema (ex: one client adds data using a schema shipped as code that another client does not have).
Some of the options do not have this issue (inline, central repository (assuming you are ok going down if it goes down and schema are not cached), and in container data)

# What options to support.

Thats a lot of options, and I think there are good reasons for all of them, so long term, we likely want all of them to be options to some extent.
But I think we can pick a good subset for the now, and leave open the option of extending it in the future.

I think we want to at least:

-   Make adoption of different constraint/schema systems optional and incremental: all of these different options should be opt in, and easy to add to and existing application if desired.
-   Provide a schema-on-read system (ex: schematize) that can give an application a nice interface to the data, including validation and error handling
    Anytime the application schema and container schema are different, this can allow the app to function as well as possible (detect and handle out of schema data, both on read and on edit, as localized as permitted by the provided error handlers).
-   Provide at least one way to customize the container schema (schema-on-write), which can at least do type based constraints.
-   Have at least one good design-pattern apps can use to handle schema migrations for each way they have to enforce/specify schema (make sure this supports a roll out process were clients have mixed code versions, and old documents will be supportable forever)

# Expected usage patterns

I suspect different users will mostly fall into 2 groups:

-   pure schema-on-read: no customization of container schema.
-   almost pure schema-on-write: only using schema-on-read to assist with schema migration so their application schema doesn't have to deal with old formats (which unavoidably pile up in the container schema)
    They may additionally use schema-on-read to enforce/fix some invariants the container schema system isn't expressive enough to declare (referential integrity for graph like references, numeric ranges, and any other appellation level invariants that are desired)

# Example/Proposed Design

This design shows an easy to implement MVP, and is not intended to have document or API compatibility with what we do longer term.
It minimally implements the requirements from "What options to support" while being extensible in the future.
It can be subseted for use in earlier milestones, and could be extended for later ones, see "Schedule" below.

This design is intentionally minimal while still being useful.
Features not needed for minimal strongly typed application use or the JSON and XML domain schema are not included.

## Schema Representation

Include a simple schema system, usable as a MVP for both `container schema` and `application schema`.

On possible such schema system is included in [Schema.ts](./Schema.ts)

These `Types` can be added as `container schema` as part of an edit op, which is considered conflicted if it tries to add a type that has a conflicting `name` and is not equal to the existing one.

While a schema must be added to the document as a container schema to use the type
(otherwise adding a new type could break existing data which might not even be downloaded on the current client),
it's possible to add a schema that is compatible with all possible data (assuming the children themselves are compatible with their own types).
Applications which wish to rely entirely on schema-on-read for some or all of their data can use this pattern for all `container schema` and only use their actual developer authored schema as `application schema`:

## Use as `Container Schema`

-   Document load: The application can check that their application schema match container schema, and check that the root has supported content.
-   Writers: When inserting new content, and updating modified nodes, share-tree can check them against the schema in the document.
    If the schema is missing, it must be added as part of the edit: for this the editing API needs to take in types which can have their desired container schema queried.
-   Change application can access schema information: changes can conflict if they violate schema (or maybe only check at end of transaction? Or at special marked places and at end?).
    Change application could (someday) adjust behavior based on schema (ex: provide set semantics to a sequence) or have schema specific edits,
    but initial version will just detect violations and mark as conflicted.
-   We can ways to update existing schema:
    -   Could support OP that changes a schema in a way where all data that was accepted by the old schema is accepted by the new one (ex: add optional fields (if compatible with extra fields), move required field into extraFields, add a type to a field).
    -   Could even do things like apply a change to all nodes with a specific type to enable edits which modify a schema and update data atomically (ex: alter table like from sql). THis does not work with partial checkouts well.

## Use as `Application Schema`

-   Document load: The application can check that their application schema match container schema, and check that the root has supported content.
-   Let app provide handlers/converters to adapt data that does not match the desired application schema (ex: support old formats), and apply them through Schematize.

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
    This may optionally be done by using the new schema as the applications schema (removing the old one), and providing schematize with a handler to do the update/conversion.
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

Schema/Shape optimized storage formats, and optimize schematize for these formats and for known container schema.

Support additional functionality (other options for container schema, imperative extensions to application schema)
