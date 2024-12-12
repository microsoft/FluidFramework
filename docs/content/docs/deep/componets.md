# Components

Fluid Framework powered applications have several ways to modularize their code and data into separate components.

## Containers

We expect most Fluid applications to operate on a single container at a time and store all their persisted content in that container.
It is however possible to use multiple containers, and some use-cases may require it.
Specifically data which require different permissions, or to be stored in different locations, has to be split into separate containers.

When splitting documents/data across multiple containers, it is up to the application to decide when to delete containers which are no longer needed.

Each container is independent synchronization wise and there is no way to do anything atomically or even strongly ordered across multiple containers.

Each container gets its own service client and thus separate op stream, storage and permissions.

If desired, an application can open a second copy of a container as a mechanism to have a separate "branch" (independent view which can have edits speculatively applied).
This is currently not well optimized (for performance, memory use or ergonomics) and the functionality of this is rather limited (its impractical to use it to preview changes, and keep rebasing them to stay up to date before committing them for example).

An application using multiple containers can (though for bundle size generally shouldn't) use different versions or copies of the framework and its runtime for different containers.

## Data Objects and Distributed Data Structures (DDSes)

Each container gets a `ContainerSchema`, which defines a tree (currently implemented using shared directory) of statically defined DDSes and DataObjects.
The container also can contain dynamically allocated DDSes and DataObjects which can be referenced from others via an `IFluidHandle`, and garbage collected when unreferenced.

When configuring the container, the application specifies which DDSes and DataObjects implementations the container supports, which implicitly selects the concrete implementation (which package version and which copy of the package if there are multiple) the container will use for the DDses and DataObjects.

Smaller libraries/components which the applications uses to work with data within the container should define version ranges of the Fluid client libraries they are compatible with, and the application should ensure all code using the same container is using the same copies of the Fluid client packages.
Some exceptions to this are known to work: TODO: list working/supported exceptions here.

An application can select which DDses (TODO: or DataObjects?) in the container to load, allowing both reading and writing to containers which are only partially loaded.
(TODO: note scalability implications due to summary client, op bandwidth).

Within a container, all DDses are synchronized, and operations can between different DDSes are ordered.
Each DDS has its own merge resolution, so there is no way to do things like multi DDS transactions, or have changes in one DDS impact how a change is merged in another, which can limit the fidelity of operations like moves of content between DDSes, even within a container.

The Fluid Framework provides a garbage collector which can delete DDSes when they become unreferenced by the container (no reachable from the root DDS, which is typically the shared directory created from the container schema).

### Data Objects

Data objects are an under development abstraction on-top of DDSes (see below) which can allow reusable logic build on DDSes to be easily reused.

Currently no public APIs exist for defining new data-object types, but the existing experimental ones can be used in container schema.

### Distributed Data Structures: DDSes

A data structure in a container, with its own self contained editing and merge resolution logic.
May contain handles to other DDSes.

Some DDSes (mainly SharedTree) provide their own functionality for further componentization of their content.

While the user of the container can choose which DDSes to load, DDSes themselves currently cannot support being only partially loaded: either the whole DDS is available or not.
The one exception to this is blobs which the user of the container can asynchronously upload then insert handle to them into the DDS.
Future work (See SharedTree) may enable some DDSes to load subsets of their data on demand.

## SharedTree

SharedTree is designed to encourage componentization by subtree / schema.
Typical usage is a given component defines its schema and logic which works with that schema.
This schema/component is then referenced/depended on by its parent, adding its schema as a child.

If an application is using a design pattern with a separate Model and View,
it should be practical to either package the view code for the component alongside its model or separately.

If the same data (same schema) needs to be handled differently in different parts of the application, that logic (anything which differs) should be separate from the schema.
Anything which is always the same however can be included as methods or additional state declared as part of the schema class if this is helpful.
While the entire tree is branched, creating a branch can be done from just a subtree, so as long as the rest of the tree isn't modified, its indistinguishable from just branching the specific subtree.

Tree provides its own branching feature, allowing additional local alternative views with buffered speculative edits.
This does not however provide any way to branch other DDSes the tree references via handles, so everything which needs to be branched this way should be kept in the same tree.

Undo and redo are at the SharedTree level, but since changes can be undone and redone in any order, the application should be able to have separate undo and redo stack for separate parts of the tree if desired.

Shared Tree allows for subscribing to events for an entire subtree, as well on individual nodes, allowing each component to implement its own event handling.
Due to how these events work, its recommenced to handle creation/removal/moving of components in the parent component which "owns" them (has them as a child).
More generally, the modularity works best when a component just cares about the content of its subtree, and does not read or depend on its parent:
access to the parent (Via `Tree.parent`) is supported, but correct invalidation code views using it is difficult and/or inefficient.

### Planned SharedTree Features

These features are planned, but not scheduled.
The design of SharedTree takes them into account, ensuring they will be possible,
but makes no guarantees on when or if they will actually be implemented.
If you require these features or would benefit from them, please let us know.

1. Open polymorphism for AllowedTypes in schema: An API to declare a union (polymorphic collection) of schema so that child schema can register them selves to be in the union which then can be used as the allowed types for a field of another schema.
This allows for the parent schema to contain the child schema while the code dependency is from child to parent (or from both parent and child to union).
This is similar to TypeScript classes and interfaces where the specializations reference the base definition.
Contrast this with SharedTree's existing unions support which works like TypeScript unions where the union definition refers directly to the member types.
This feature is particularly important for apps which which to define the schema for a component as part of the component (which is encouraged) when the components can be nested co-recursively resulting in the normal way to declare schema causing a cyclic dependency.
This can actually work (even without this feature by using to lazy schema references), but is often undesirable.
This feature can also be leveraged to encapsulate schema (ex: not have to export if from a package) for a component since it type erases the child schema in the parent union.
It possible for the application to require any registered member of the union to implement some interface (for the schema statically or for the nodes) so it can, in a type safe way,
ensure all components at that location in the tree implement some required contract (for example projecting their data into a view, or handling selection)
2. Adapters: An API to allow an app to declare additional formats/schema an item  might have, and how to convert from that format to the canonical one.
This allows separating support for these (typically legacy) formats into their own standalone code which only needs to be referenced once when configuring the application to include the adapters in the TreeConfiguration.
This avoids having to complicate the logic for reading/viewing/editing the tree from having to know about or handle these alternative formats.
One directional adapters could be used for migrating data (ideally lazily on first modification), while two directional adapters could even allow (when desired) keeping the persisted data in the legacy format for compatibility even across edits.
3. Unknown content adapters: A special kind of Adapter which can be used to handle content in an unknown format at a specific location in the tree.
This can provide localized/modular error handling for when an application opens a document where subsets of it are in formats the application does not understand.
4. Partial loading support: The schema can opt into specific nodes or fields being lazy loaded, allowing for much larger documents to be opened and edited.
This will limit the functionality of indexes (unloaded content will not be included) unless the index is persisted as part of the document.
5. Additional events: events could be added for cases like parent changed, or path changed.
Alternatively or additionally observation tracking could be added to help with invalidation of derived data.
This would make having components depend on their parent or parent derived context more practical to support.

There are also some more speculative ideas which have been considered but are not planned:

1. Optional Smart Service: an additional service could be run to improve partial locating support.
It could handle summarization, indexes, filtering ops only to clients that need them and enforce fine grained permissions to allow for lighter weight clients or reduced permissions.
This would allow modularizing things requiring permissions at the subtree level, which would otherwise only be possible with multiple containers.
2. External data adapters: a generalization of adapters which would allow projecting data from another tree or even some unrelated data source into a subtree from the perspective of schema and the code using the tree.
