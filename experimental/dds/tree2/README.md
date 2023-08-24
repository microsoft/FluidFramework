# @fluid-experimental/tree2

This DDS is not yet ready for public consumption. For a high-level overview of the goals of this project, see the [roadmap](docs/roadmap.md).

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

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
    -   Support for partial views: allow efficiently viewing and editing parts of larger datasets without downloading the whole thing.
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

`sequence` does not capture the hierarchy or schema, and also does not handle partial views.
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
Cross DDS moves also currently can't be as efficient as moves within a single DDS, and there isn't a good way to do cross DDS history or branching without major framework changes.
There are also some significant per DDS performance and storage costs that make this approach much more costly than using a single DDS.

One way to think about this new tree DDS is to try and mix some of the Fluid-Framework features (like the ability to view a subset of the data) with features from DDSes (ex: lower overhead per item, efficient moves of sub-sequences, transactions).
If this effort is successful, it might reveal some improved abstractions for modularizing hierarchical collaborative data-structures (perhaps "field kinds"),
which could make their way back into the framework, enabling some features specific to this tree (ex: history, branching, transactional moves, reduced overhead) to be framework features instead.

From this perspective, this tree serves as a proof of concept for abstractions and features which could benefit the framework, but are easier to implement within a DDS initially.
This tree serves to get these feature into the hands of users much faster than could be done at the framework level.

## Recommended Developer Workflow

This package can be developed using any of the [regular workflows for working on Fluid Framework](../../../README.md) and/or its Client release group of packages, but for work only touching the tree package, there is an optional workflow that might be more ergonomic:

-   Open the [.vscode/Tree.code-workspace](.vscode/Tree.code-workspace) in VS Code.
    This will recommend a test runner extension, which should be installed.
-   Build the Client release group as normal (for example: `npm i && npm run build:fast` in the repository root).
-   After editing the tree project, run `npm run build` in its directory.
-   Run tests using the "Testing" side panel in VS Code, or using the inline `Run | Debug` buttons which should show up above tests in the source:
    both of these are provided by the mocha testing extension thats recommended by the workspace.
    Note that this does not build the tests, so always be sure to build first.

This package uses [`good-fences`](https://github.com/smikula/good-fences) to manage intra-package dependencies in `fence.json` files.
If modifying such dependencies, learn how `good-fences` works, and review (and update if needed) the "Architecture" section below.

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
    subgraph "@fluid-experimental/tree2"
        shared-tree--"extends"-->shared-tree-core
        shared-tree-core-."reads".->doc
        shared-tree-core-->EditManager-->X["collab window & branches"]
        shared-tree-core-->Indexes-->ForestIndex
        shared-tree-->view["SharedTreeView"]
        transaction-."updates".->view
        transaction-->EditBuilder
        view-."reads".->ForestIndex
        view-->transaction
    end
```

`tree` is a DDS, and therefore it stores its persisted data in a Fluid Container, and is also owned by that same container.
When nothing in that container references the DDS anymore, it may get garbage collected by the Fluid GC.

The tree DDS itself, or more specifically [`shared-tree-core`](./src/shared-tree-core/README.md) is composed of a collection of indexes (just like a database) which contribute data which get persisted as part of the summary in the container.
`shared-tree-core` owns these databases, and is responsible for populating them from summaries and updating them when summarizing.

See [indexes and branches](./docs/indexes%20and%20branches.md) for details on how this works with branches.

When applications want access to the `tree`'s data, they do so through an [`ISharedTreeView`](./src/shared-tree/sharedTreeView.ts) which abstracts the indexes into nice application facing APIs.
Views may also have state from the application, including:

-   [`view-schema`](./src/core/schema-view/README.md)
-   adapters for out-of-schema data
-   request or hints for what subsets of the tree to keep in memory
-   pending transactions
-   registrations for application callbacks / events.

[`shared-tree`](./src/shared-tree/) provides a default view which it owns, but applications can create more if desired, which they will own.
Since views subscribe to events from `shared-tree`, explicitly disposing any additionally created ones of is required to avoid leaks.

[transactions](./src/core/transaction/README.md) are created by `ISharedTreeView`s and are currently synchronous.
Support for asynchronous transactions, with the application managing the lifetime and ensuring it does not exceed the lifetime of the view,
could be added in the future.

### Data Flow

#### Viewing

```mermaid
flowchart LR;
    doc["Persisted Summaries"]--"Summary+Trailing ops"-->shared-tree-core
    subgraph "@fluid-experimental/tree2"
        shared-tree--"configures"-->shared-tree-core
        shared-tree-core--"Summary"-->Indexes--"Summary"-->ForestIndex;
        ForestIndex--"Exposed by"-->ISharedTreeView
    end
    ISharedTreeView--"viewed by"-->app
```

[`shared-tree`](./src/shared-tree/) configures [`shared-tree-core`](./src/shared-tree-core/README.md) with a set of indexes.
`shared-tree-core` downloads the summary data from the Fluid Container, feeding the summary data (and any future edits) into the indexes.
`shared-tree` then constructs the default view.
The application using the `shared-tree` can get the view from which it can read data (which the view internally gets from the indexes).
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
It works by storing the tree data in a [`forest`](./src/core/forest/README.md) which updates itself using deltas.
When an application chooses to use the second pattern,
it can be thought of as opting into a specialized application (or domain) specific tree representation.
From that perspective the first pattern amounts to using the platform-provided general purpose tree representation:
this should usually be easier, but may incur some performance overhead in specific cases.

When views want to hold onto part of the tree (for the first pattern),
they do so with "anchors" which have well defined behavior across edits.

TODO: Note that as some point the application will want their [`view-schema`](./src/core/schema-view/README.md) applied to the tree from the view.
The system for doing this is called "schematize" and is currently not implemented.
When it is more designed, some details for how it works belong in this section (as well as the section below).

### Editing

Edit related data flow with solid arrows.
Key view related updates made in response with dotted arrows.

This shows editing during a transaction:

```mermaid
flowchart RL
    subgraph "@fluid-experimental/tree2"
        transaction--"collects edits in"-->EditBuilder
        EditBuilder--"updates anchors"-->AnchorSet
        EditBuilder--"deltas for edits"-->transaction
        transaction--"applies deltas to"-->forest["ISharedTreeView's forest"]
    end
    command["App's command callback"]
    command--"Edits"-->transaction
    forest-."invalidation".->command
```

The application can use their view to locate places they want to edit.
The application passes a "command" to the view which create a transaction that runs the command.
This "command" can interactively edit the tree.
Internally the transaction implements these edits by creating changes.
Each change is processed in two ways:

-   the change is converted to a delta which is applied to the forest and any existing anchors allowing the application to read the updated tree afterwards.
-   the changes applied to the `EditBuilder` are accumulated and used to create/encode the actual edit to send to Fluid.

Once the command ends, the transaction is rolled back leaving the forest in a clean state.
Then if the command did not error, a `changeset` is created from the changes applied to the `EditBuilder`, which is encoded into a Fluid Op.
The view then rebases the op if any Ops came in while the transaction was pending (only possible for async transactions or if the view was behind due to it being async for some reason).
Finally the view sends the op to `shared-tree-core` which submits it to Fluid.
This submission results in the op becoming a local op, which `shared-tree-core` creates a delta for.
This delta goes to the indexes, resulting in the ForestIndex and thus views getting updated,
as well as anything else subscribing to deltas.

This shows completion of a transaction.
Not shown are the rollback or changes to forest (and the resulting invalidation) and AnchorSet,
then the updating of them with the final version of the edit.
In the common case this can be skipped (since they cancel out).
Also not shown is the (also usually unneeded) step of rebasing the changeset before storing it and sending it to the service.

```mermaid
flowchart LR
    command["App's command callback"]--"commit"-->transaction
    subgraph "@fluid-experimental/tree2"
        transaction--"build"-->EditBuilder
        EditBuilder--"changeset"-->transaction
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
    subgraph "@fluid-experimental/tree2"
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

`@fluid-experimental/tree2` depends on the Fluid runtime (various packages in `@fluidframework/*`)
and will be depended on directly by application using it (though at that time it will be moved out of `@fluid-internal`).
`@fluid-experimental/tree2` is also complex,
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
    One example of this is in [rebase](./src/core/rebase/README.md) where we ensured that the stateful system, `Rebaser` is not depended on by the actual change specific rebase policy.
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
    subgraph package ["@fluid-experimental/tree2"]
        direction TB
        subgraph core ["core libraries"]
            direction TB
            schema-view
            forest-->schema-stored
            rebase-->tree
            change-family-->repair
            rebase-->repair
            schema-stored-->dependency-tracking
            schema-view-->schema-stored
            dependency-tracking
            forest-->tree
            undo-->rebase
            undo-->change-family
        end
        core-->events-->util
        core-->id-compressor-->util
        core-->codec-->util
        feature-->shared-tree-core
        shared-tree-core-->core
        shared-tree-->feature
        external-utilities-->feature
        subgraph feature ["feature-libraries"]
            direction TB
            schema-aware-->defaultSchema
            schema-aware-->contextuallyTyped
            editable-tree-->contextuallyTyped
            editable-tree-->node-key
            defaultRebaser
            contextuallyTyped-->defaultFieldKinds
            defaultSchema-->defaultFieldKinds-->modular-schema
            forestIndex-->treeTextCursor
            modular-schema
            node-key-->modular-schema
            node-key-->defaultFieldKinds
            object-forest-->mapTreeCursor-->treeCursorUtils
            chunked-forest-->treeCursorUtils
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

## How should specialized sub-tree handling compose?

Applications should have a domain model that can mix editable tree nodes with custom implementations as needed.
Custom implementations should probably be able to be projections of editable trees, the forest content (via cursors), and updated via either regeneration from the input, or updated by a delta.
This is important for performance/scalability and might be how we do virtualization (maybe subtrees that aren't downloaded are just one custom representation?).
This might also be the layer at which we hook up schematize.
Alternatively, it might be an explicitly two-phase setup (schematize then normalize), but we might share logic between the two and have non-copying bypasses.

How all this relates to [dependency-tracking](./src/core/dependency-tracking/README.md) is to be determined.
