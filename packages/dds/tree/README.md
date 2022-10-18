# @fluid-internal/tree

This DDS is not yet ready for public consumption. See (#8273)[https://github.com/microsoft/FluidFramework/issues/8273].

## Motivation

There are a lot of different factors motivating the creation of this Tree DDS.
A wide variety of possible consumers (across several companies) have overlapping feature requirements
which seem like they can best be met by collaborating on a single feature rich tree implementation powered by Fluid.
The current feature focus is on:

-   Semantics:
    -   High quality semantic merges, including moves of parts of sequences (called "slice moves").
    -   Transactionality.
    -   Support schema in a semantically robust way.
-   Scalability:
    -   Support for partial checkouts: allow efficiently viewing and editing parts of larger datasets without downloading the whole thing.
    -   Ability to easily (sharing code with client) spin up optional services to improve scalability further (ex: server side summaries, indexing, permissions etc.)
    -   Efficient data encodings.
-   Expressiveness:
    -   Efficient support for moves, including moves of large sections of large sequences, and large subtrees.
    -   Support history operations (ex: undo and redo).
    -   Flexible schema system that has design patterns for making schema changes over time.
-   Workflows:
    -   Good support for offline.
    -   Optional support for branching and history.
-   Extensibility: It must be practical to accommodate future users with needs beyond what we can afford to support in the initial version. This includes needs like:
    -   New field kinds to allow data-modeling with more specific merge semantics (ex: adding support for special collections like sets, or sorted sequences)
    -   New services (ex: to support permissions, server side indexing etc.)

## Whats missing from existing DDSes?

`directory` and `map` can not provide merge resolution that guarantees well-formedness of trees while supporting the desired editing APIs (like subsequence move),
and are missing (and cannot be practically extended to have) efficient ways to handle large data or schema.

`sequence` does not capture the hierarchy or schema, and also does not handle partial checkouts.
Additionally its actual merge resolution leaves some things to be desired in some cases which `tree` aims to improve on.

`experimental/tree` does not have a built in schema system reducing the data available to make semantically high quality merges.
It also does merge resolution in a way that requires having the whole tree in memory due to it being based entirely on node identifiers
(including constraints within transactions that can't be verified without reading large parts of the tree).

`experimental/PropertyDDS` currently does not have as high quality merge logic as desired, currently not even supporting efficient moves.
Much of what is desired is theoretically possible as additional feature work on `PropertyDDS`,
but it was decided that it makes more sense to build up this more featureful DDS from scratch leveraging the learnings from `PropertyDDS` and `experimental/tree`.

## Why not a tree made out of existing DDS implementations and how this relates to the Fluid Framework itself?

Currently existing DDS implementations can not support cross DDS transactions.
For example, moving part of a sequence from one sequence DDS to another cannot be done transactionally, meaning if the source of the move conflicts, the destination half can't be updated or aborted if it's in a different DDS.
Cross DDS moves also currently can't be as efficient as moves withing a single DDS, and there isn't a good way to do cross DDS history or branching without major framework changes.
There are also some significant per DDS performance and storage costs that make this approach much more costly than using a single DDS.

One way to think about this new tree DDS is to try and mix some of the Fluid-Framework features (like the ability to checkout a subset of the data) with features from DDSes (ex: lower overhead per item, efficient moves of sub-sequences, transactions).
If this effort is successful, it might reveal some improved abstractions for modularizing hierarchical collaborative data-structures (perhaps "field kinds"),
which could make their way back into the framework, enabling some features specific to this tree (ex: history, branching, transactional moves, reduced overhead) to be framework features instead.

From this perspective, this tree serves as a proof of concept for abstractions and features which could benefit the framework, but are easier to implement within a DDS initially.
This tree serves to get these feature into the hands of users much faster than could be done at the framework level.

## Architecture

This section covers the internal structure of the Tree DDS.
In this section the user of this package is called "the application".
"The application" is full of "application code", meaning code which can be specific to particular schema and use-cases.
This typically means the client side "business logic" or "view" part of some graphical web application, but it could also mean something headless like a service.

### Ownership and Lifetimes

This diagram shows the ownership hierarchy during a transaction with solid arrows, and some important references with dashed arrows:

```mermaid
graph TD;
    subgraph "Persisted Data"
        store["Data Store"]-->doc["Persisted Summaries"]
    end
    container["Fluid Container"]-->shared-tree
    subgraph "@fluid-internal/tree"
        shared-tree--"extends"-->shared-tree-core
        shared-tree-core-."reads".->doc
        shared-tree-core-->EditManager-->X["collab window & branches"]
        shared-tree-core-->Indexes-->ForestIndex
        shared-tree-->checkout["default checkout"]
        transaction-."updates".->checkout
        transaction-->ProgressiveEditBuilder
        checkout-."reads".->ForestIndex
        checkout-->transaction
    end
```

`tree` is a DDS, and therefore it stores its persisted data in a Fluid Container, and is also owned by that same container.
When nothing in that container references the DDS anymore, it may get garbage collected by the Fluid GC.

The tree DDS itself, or more specifically [`shared-tree-core`](./src/shared-tree-core/README.md) is composed of a collection of indexes (just like a database) which contribute data which get persisted as part of the summary in the container.
`shared-tree-core` owns these databases, and is responsible for populating them from summaries and updating them when summarizing.

TODO: When support for multiple branches is added, do we want to have indexes for each branch, and if so, maybe their ownership should move to a branch-specific structure (like checkout?).

When applications want access to the `tree`'s data, they do so through a [`checkout`](./src/checkout/README.md) which abstracts the indexes into nice application facing APIs.
Checkouts may also have state from the application, including:

-   [`view-schema`](./src/schema-view/README.md)
-   adapters for out-of-schema data
-   request or hints for what subsets of the tree to keep in memory
-   pending transactions
-   registrations for application callbacks / events.

[`shared-tree`](./src/shared-tree/) provides a default checkout which it owns, but applications can create more if desired, which they will own.
Since checkouts subscribe to events from `shared-tree`, explicitly disposing any additionally created ones of is required to avoid leaks.

[transactions](./src/transaction/README.md) are created from `checkouts` and are currently synchronous.
Support for asynchronous transactions, with the application managing the lifetime and ensuring it does not exceed the lifetime of the checkout,
could be added in the future.

### Data Flow

#### Viewing

```mermaid
flowchart LR;
    doc["Persisted Summaries"]--"Summary+Trailing ops"-->shared-tree-core
    subgraph "@fluid-internal/tree"
        shared-tree--"configures"-->shared-tree-core
        shared-tree-core--"Summary"-->Indexes--"Summary"-->ForestIndex;
        ForestIndex--"Exposed by"-->checkout
    end
    checkout--"viewed by"-->app
```

[`shared-tree`](./src/shared-tree/) configures [`shared-tree-core`](./src/shared-tree-core/README.md) with a set of indexes.
`shared-tree-core` downloads the summary data from the Fluid Container, feeding the summary data (and any future edits) into the indexes.
`shared-tree` then constructs the default `checkout`.
The application using the `shared-tree` can get the checkout from which it can read data (which the checkout internally gets from the indexes).
For any given part of the application this will typically follow one of two patterns:

-   read the tree data as needed to create the view.
    Register invalidation call backs for when the observed parts of the tree change.
    When invalidated, reconstruct the invalidated parts of the view by rereading the tree.
-   read the tree data as needed to create the view.
    Register delta callbacks for when the observed parts of the tree change.
    When a delta is received, update the view in place according to the delta.

TODO: Eventually these two approaches should be able to be mixed and matched for different parts of the application as desired, receiving scoped deltas.
For now deltas are global.

Note that the first pattern is implemented using the second.
It works by storing the tree data in a [`forest`](./src/forest/README.md) which updates itself using deltas.
When an application chooses to use the second pattern,
it can be thought of as opting into a specialized application (or domain) specific tree representation.
From that perspective the first pattern amounts to using the platform-provided general purpose tree representation:
this should usually be easier, but may incur some performance overhead in specific cases.

When views want to hold onto part of the tree (for the first pattern),
they do so with "anchors" which have well defined behavior across edits.

TODO: Note that as some point the application will want their [`view-schema`](./src/schema-view/README.md) applied to the tree from the checkout.
The system for doing this is called "schematize" and is currently not implemented.
When it is more designed, some details for how it works belong in this section (as well as the section below).

### Editing

Edit related data flow with solid arrows.
Key view related updates made in response with dotted arrows.

This shows editing during a transaction:

```mermaid
flowchart RL
    subgraph "@fluid-internal/tree"
        transaction--"collects edits in"-->ProgressiveEditBuilder
        ProgressiveEditBuilder--"updates anchors"-->AnchorSet
        ProgressiveEditBuilder--"deltas for edits"-->transaction
        transaction--"applies deltas to"-->forest["checkout's forest"]
    end
    command["App's command callback"]
    command--"Edits"-->transaction
    forest-."invalidation".->command
```

The application can use their view to locate places they want to edit.
The application passes a "command" to the checkout which create a transaction that runs the command.
This "command" can interactively edit the tree.
Internally the transaction implements these edits by creating changes.
Each change is processed in two ways:

-   the change is converted to a delta which is applied to the forest and any existing anchors allowing the application to read the updated tree afterwards.
-   the change is accumulated in a `ProgressiveEditBuilder` which will be used to create/encode the actual edit to send to Fluid.

Once the command ends, the transaction is rolled back leaving the forest in a clean state.
Then if the command did not error, a `changeset` is created from the `ProgressiveEditBuilder`, which is encoded into a Fluid Op.
The checkout then rebases the op if any Ops came in while the transaction was pending (only possible for async transactions or if the checkout was behind due to it being async for some reason).
Finally the checkout sends the op to `shared-tree-core` which submits it to Fluid.
This submission results in the op becoming a local op, which `shared-tree-core` creates a delta for.
This delta goes to the indexes, resulting in the ForestIndex and thus checkouts getting updated,
as well as anything else subscribing to deltas.

This shows completion of a transaction.
Not shown are the rollback or changes to forest (and the resulting invalidation) and AnchorSet,
then the updating of them with the final version of the edit.
In the common case this can be skipped (since they cancel out).
Also not shown is the (also usually unneeded) step of rebasing the changeset before storing it and sending it to the service.

```mermaid
flowchart LR
    command["App's command callback"]--"commit"-->transaction
    subgraph "@fluid-internal/tree"
        transaction--"build"-->ProgressiveEditBuilder
        ProgressiveEditBuilder--"changeset"-->transaction
        transaction--"changeset (from builder)"-->core["shared-tree-core"]
        core--"changeset"-->EditManager--"changeset"-->local["Local Branch"]
    end
    core--"Op"-->service["Fluid ordering service (Kafka)"]
    service--"Sequenced Op"-->clients["All clients"]
    service--"Sequenced Op"-->log["Op Log"]
```

When the op gets sequenced, `shared-tree-core` receives it back from the ordering service,
rebases it as needed, and sends another delta to the indexes.

```mermaid
graph LR;
    service["Fluid Service"]--"Sequenced Op"-->core["shared-tree-core"]
    subgraph "@fluid-internal/tree"
        core--"changeset"-->EditManager
        EditManager--"add changeset"-->remote["remote branch"]
        remote--"rebase into"-->main[main branch]
        main--"rebase over new changeset"-->local["Local Branch"]
        main--"sequenced changeset"-->Indexes
        local--"delta"-->Indexes
        Indexes--"delta"-->ForestIndex
    end
    ForestIndex--"invalidates"-->app
    Indexes--"delta (for apps that want deltas)"-->app
```

### Dependencies

`@fluid-internal/tree` depends on the Fluid runtime (various packages in `@fluidframework/*`)
and will be depended on directly by application using it (though at that time it will be moved out of `@fluid-internal`).
`@fluid-internal/tree` is also complex,
so its implementation is broken up into several parts which have carefully controlled dependencies to help ensure the codebase is maintainable.
The goal of this internal structuring is to make evolution and maintenance easy.
Some of the principles used to guide this are:

-   Avoid cyclic dependencies:

    Cyclic dependencies can make it hard to learn a codebase incrementally, as well as make it hard to update or replace parts of the codebase incrementally.
    Additionally they can cause runtime issues with initialization.

-   Minimize coupling:

    Reducing the number and complexity of edges in the dependency graph.
    This often involves approaches like making a component generic instead of depending on a concrete type directly,
    or combining related components that have a lot of coupling.

-   Reducing transitive dependencies:

    Try to keep the total number of dependencies of a given component small when possible.
    This applies both at the module level, but also for the actual object defined by those modules.
    One particular kind of dependency we make a particular effort to avoid are dependencies on stateful systems from code that has complex conditional logic.
    One example of this is in [rebase](./src/rebase/README.md) where we ensured that the stateful system, `Rebaser` is not depended on by the actual change specific rebase policy.
    Instead the actual replace policy logic for changes is behind the `ChangeRebaser` interface, which does not depend on `Rebaser` and exposes the policy as pure functions (and thus is stateless).
    This is important for testability, since complex conditional logic (like `ChangeRebaser` implementations) require extensive unit testing,
    which is very difficult (and often slow) for stateful systems and systems with lots of dependencies.
    If we instead took the pattern of putting the change rebasing policy in `Rebaser` subclasses,
    this would violate this guiding principal and result in much harder to isolate and test policy logic.

    Another aspect of reducing transitive dependencies is reducing the required dependencies for particular scenarios.
    This means factoring out code that is not always required (such as support for extra features and optimizations) such that they can be omitted when not needed.
    `shared-tree-core` is an excellent example of this: it can be run with no indexes, and trivial a change family allowing it to have very few required dependencies.
    This often takes the form of either depending on interfaces (which can have their implementation swapped out or mocked), like [`ChangeFamily`](./src/change-family/README.md), or collection functionality in a registry, like we do for `FieldKinds` and `shared-tree-core`'s indexes.
    Dependency injection is one example of a useful pattern for reducing transitive dependencies.
    In addition to simplifying reasoning about the system (less total to think about for a given scenario) and simplifying testing,
    this approach also makes the lifecycle for new features easier to manage, since they can be fully implemented and tested without having to modify code outside of themselves.
    This makes pre-releases, stabilization and eventual deprecation of these features much easier, and even makes publishing them from separate packages possible if it ends up needing an even more separated lifecycle.

    Additionally, this architectural approach can lead to smaller applications by not pulling in unneeded functionality.

These approaches have led to a dependency structure that looks roughly like the diagram below.
A more exact structure can be observed from the `fence.json` files which are enforced via [good-fences](https://www.npmjs.com/package/good-fences).
In this diagram, some dependency arrows for dependencies which are already included transitively are omitted.

```mermaid
flowchart
    direction TB
    subgraph package ["@fluid-internal/tree"]
        direction TB
        subgraph core ["core libraries"]
            direction TB
            checkout-->forest
            shared-tree-core-->change-family
            forest-->schema-stored
            change-family-->rebase
            edit-manager-->change-family
            rebase-->tree
            schema-stored-->dependency-tracking
            schema-view-->schema-stored
            transaction-->change-family
            transaction-->checkout
            dependency-tracking
            forest-->tree
        end
        core-->util
        feature-->core
        shared-tree-->feature
        subgraph feature ["feature-libraries"]
            direction TB
            defaultRebaser
            defaultSchema-->defaultFieldKinds-->modular-schema
            forestIndex-->treeTextCursor
            modular-schema
            object-forest-->treeTextCursor
            schemaIndex
            sequence-change-family-->treeTextCursor
        end
        subgraph domains
            JSON
        end
        domains-->feature
    end
    package-->runtime["Fluid runtime"]
```

# Open Design Questions

The design issues here all impact the architectural role of top-level modules in this package in a way that when fixed will likely require changes to the architectural details covered above.
Smaller scoped issues which will not impact the overall architecture should be documented in more localized locations.

## How should indexes relate to branches?

Some possible options:

-   Use copy on write in indexes, and keep all needed indexes for all needed revisions within edit-manager. Provide all relevant indexes to `ChangeRebaser`. Maybe allow `ChangeRebaser` to compute intermediate indexes as needed.
-   Keep a single index, and adjust it to the needed location in the branch tree as needed using deltas.
-   Keep multiple indexes, one at each branch head, updated via mutation.
-   Keep a single reference index (maybe after the latest sequenced edit), and make delta indexes referencing it for the other required branches.
-   Something else?

## How should specialized sub-tree handling compose?

Applications should have a domain model that can mix editable tree nodes with custom implementations as needed.
Custom implementations should probably be able to be projections of editable trees, the forest content (via cursors), and updated via either regeneration from the input, or updated by a delta.
This is important for performance/scalability and might be how we do virtualization (maybe subtrees that aren't downloaded are just one custom representation?).
This might also be the layer at which we hook up schematize.
Alternatively, it might be an explicitly two-phase setup (schematize then normalize), but we might share logic between the two and have non-copying bypasses.

How all this relates to [dependency-tracking](./src/dependency-tracking/README.md) is to be determined.
