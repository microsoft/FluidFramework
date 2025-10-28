# SharedTree Design Philosophy

The goal of the SharedTree project is empower developers to create and maintain better collaborative experiences.

To best achieve this goal we plan to deliver a set of libraries that enable developers to:

-   Productively create and maintain collaborative experiences.

    Doing this "productively" means ensuring that developers will be directed into using patterns that work well for collaborative applications,
    and ensuring that useful supporting libraries are in place to make this a good experience.

-   Easily learn how to use the libraries without relying on prior experience with collaboration tools.

    Using the libraries should teach what is needed when it's needed rather than requiring collaboration specific knowledge or experience as a prerequisite.
    The learning curve should be fast enough to be productive on day one, both for maintaining existing experiences or authoring new ones.

-   Leverage existing tools, code and knowledge where practical.

    When authoring an application using SharedTree, it should be easy to interoperate with existing libraries and services.
    SharedTree's APIs should interoperate with existing common libraries, conventions, standards and data-models.
    When multiple options are possible, SharedTree should align with more popular established patterns and ecosystems for seamless integration while ensuring that other existing systems can still be used through additional customized adapters or interop logic as needed.

-   Avoid common pitfalls of collaborative software.

    Collaboration often introduces subtle requirements, especially around compatibility, updates, offline use, error cases, persistence and concurrency.
    Picking the right design patterns (above) as well as explicitly drawing attention to particular details in the API design, documentation and examples all need to work together to holistically guide developers into creating experiences that collaborate correctly.
    Additionally, the resulting experiences need to be maintainable, including easy authoring of new features and reviewing of changes for possible collaboration issues.
    For code authors, it should be easy to find the right way to do something, and know it will be robust.
    For code reviews, it should be obvious in review, only looking at the changed code, if it might introduce a collaboration related issue (such as unexpected merge behavior, issues collaborating with previous or future versions of the app, inability to open old document, etc.).
    This needs to be true, even for novice users of SharedTree without experience writing collaborative experiences.

    One way this is achieved is to ensure work and requirements specific to collaboration support will be easy to discover when relevant and easy to learn about and handle when needed.
    For example, if adding a new editing operation, it should be obvious how to ensure the required application invariants hold—even across merges—, and what the implications are for deployment and cross-client compatibility.

-   Adopt SharedTree without concern for having to migrate to another solution due to hitting limitations.

    This means that if a developer wants to make a change that interacts with collaboration, the fact that their application is powered by SharedTree will not be a limiting factor on what can be achieved.
    This includes compatibility between different applications or versions of an application, scalability, availability, merge quality, etc.
    More concretely, if faced with a new application collaboration requirement, it should be practical to either build it on top of SharedTree or extend SharedTree to support it.
    Doing this should not require major reworking of either the application or SharedTree implementations, not require extending it in a way that the upstream SharedTree would not be willing to maintain.

-   Generalize investments into improved user experiences across many different applications.

    As much as possible, SharedTree should serve as a framework for sharing generalized collaborative logic, and a good default library of such logic.
    For example merge resolution strategies, compatibility adapters, debug tools, common schema etc, can be generalized for easy use by all users of SharedTree.
    Users of SharedTree can start by authoring their own specialized version of any of these (if needed), and then consider generalizing them as either independent libraries or upstream contributions.

Another way to describe these goals is that SharedTree needs to be able to be **adopted with confidence**.
Once adopted, it must **compatible with existing systems**, **easily learnable** and **productive** for developers new to collaborative application while being **flexible** in what it supports and produce **robust** and **high quality** collaborative experiences.

In addition to these overall goals, SharedTree also needs to provide an MVP early in the development and internally be **maintainable** and **extensible**.
This allows it to deliver value early, but also continue to be developed to reduce the development effort required of application authors to improve the experience it enables for end users.
These internal requirements mostly follow from the above flexibility requirement, but are worth the extra emphasis.

# Balancing Conflicting Goals

These goals are values which the SharedTree tries to maximize.
There are however cases where trade-offs must be made.
For example, being compatible with existing libraries and conventions from non-collaborative applications can lead to APIs that lead to common collaboration pitfalls, like unclear merge behavior due to insufficient semantics captured through the editing APIs.
Much of the design of SharedTree is to avoid having to make these tradeoffs and this is the preferred approach, however some can not be avoided, and they will be evaluated carefully.

# Implications of these Goals

Commonly desired collaboration features should be easy for applications to support, but when supporting them requires extra work, they can be explicitly opted out of or deferred to a future version.

This include features like:

-   cross-client compatibility support to enable incremental rollout of updates.
-   compatibility between different applications, including when those applications evolve their schema.
-   fine grained and/or customized merge resolution.
-   support for offline use.
-   ensuring specific application data invariants hold.
-   scaling to large datasets.
-   services to accelerate some operations (like summarization, search etc).

SharedTree's approach to doing all this while being extensible and maintainable relies on modularity and versioning, and is covered below.

# A Design For Extensibility and Compatibility with Versioning

SharedTree is a collaborative data-structure allowing cross-client compatibility as well as support for loading all old formats.
This imposes some very strict compatibility requirements that can make changing its implementation and functionality difficult.

This puts a large tension between maintainability and extensibility, and leads to a design that is focused on
optimizing for extensibility while minimizing the difficulty of maintaining compatibility across these extensions.
The approach SharedTree takes for this is separation of concerns and version-ability of components.

Concepts are split into two categories based on compatibility requirements (see [SchemaVersioning](packages/dds/SchemaVersioning.md) for details of why these exist and what is in each):

1. Critical for consistent behavior and thus must have compatibility forever to support old document and cross-client compatibility.
2. Only impacts the current instance of the application, and can be changed without maintaining identical behavior in previously supported cases.

The SharedTree design minimizes the amount of stuff (code, formats, data, etc) in the first category and attempts to keep items in the first category as simple and independent as practical.

For example, the merge resolution logic for sequences is defined as a single component, and if it needs changes that are incompatible (for example an improvement to merge resolution), it's possible to simply author a new version of this logic, and select between both at runtime based on either protocol version or schema.

Additionally the SharedTree architecture organizes these components such that if needed they can be replaced incrementally.
For example, the tree reading and editing API is built on-top of cursors.
A different version of this API can be authored, tested and adopted side by side with the old one with minimum difficulty.
If the underlying tree storage (`forest`) changes, the tree API components (`flex-tree` (internal) and `simple-tree` (public)) will not be impacted.
Similarly if the cursor API needed to change, forest could add support for the new one (without dropping the old one), then users could migrate incrementally.
This kind of concurrent multi-version support is extra important for cases which fall into category one above (impact data compatibility not just API compatibility).
For example SharedTree can introduce a new version of editing primitives and/or merge semantics for a field kind (for example sequence, see below),
which applications can opt into in their schema in a compatible way.

SharedTree is also designed to ensure applications using it can also adopt this same compatibility approach while minimizing the frequency and difficulty of doing so.
For example the APIs SharedTree exposes for working with schema are designed to help guide their users into design patterns that are robust and maintainable even when faced with supporting large numbers of legacy schema.

## Data Model and Editing

When users edit documents, those high level semantic operations need to be encoded in a way that supports merges.
Additionally this encoding needs to be deterministically applied in all clients, even if they are using different version of SharedTree.
This needs to be done such that applications can ensure invariants hold in their data model.
This means the editing and merge logic must be kept identical for compatibility, and changes to them instead must only add support for new cases.
For example, new edit operations can be added or new configuration flags added to existing ones, but how a particular merge gets resolved cannot be changed without introducing a compatibility issue.
This can get complicated, so to keep it manageable, this problem was subdivided in a few different ways.

The data-model for SharedTree was selected to assist with subdividing this problem.
The selected data-model consists of many small structures named **fields** where collaborative edits interact, and **nodes** which connect them into a hierarchy and assigns types to each of the fields.

The nodes have schema which define the schema for their fields.
There are a few [kinds](<https://en.wikipedia.org/wiki/Kind_(type_theory)>) of nodes that configure their fields differently, for example objects (with a fixed set of mixed field types) or maps (with an extensible set of matching field types).

There are also a few kinds of fields which provide different collaborative data-structures (like `sequence`, or `optional`), each of which hold nodes and define what edits can be made to them.

All of the editing is done in the fields via the `field kind`.
This allows the editing logic, both API and merge policy, to be packaged together into minimal versionable units (`field kinds`).
Since the schema explicitly selects what field kinds to use, updating them is opt-in, and can be coordinated with deployment schedules to achieve the required cross-client compatibility requirements.
This also leverages all the same collaboration as the rest of schema evolution, making adopting alternative field kinds no different from updating other aspects of the application's schema.

This results in a tree where the overall shape is controlled by the application via its tree schema (for the nodes) and the alternating layers of fields provide all the complex logic, neatly separating the concerns.
This can also be thought of as a tree of entities alternating between fields and nodes.
As these two kinds of entities alternate and thus never touch, this resembles a [bipartite graph](https://en.wikipedia.org/wiki/Bipartite_graph), and can be called a bipartite tree.

To better align this data-model with existing libraries, `simple-tree` abstracts fields in a way that depends on the kind of the node they are part of.
For example the fields of object nodes are presented as JavaScript enumerable own properties.
Additionally `simple-tree` restricts where different kinds of fields can be used to help with this.
For example `sequence` fields are only permitted via `array` nodes, which present the node and its sequence field like an array.
To assist with this `simple-tree` leverages view schema which allow the application to provide guidance on how to construct the API for each type of node.

# Constraints

When users edit documents, those high level semantic operations need to be encoded in a way that supports merges.
These merges need to balance two competing requirements:

1. The merges apply both sets of edits.
2. Applications can easily ensure the invariants they require will be maintained across merges.

The second requirement can always be met by discarding one of the edits, while the first can be met by always adjusting the second editing into something that can be applied.
This places these two requirements in conflict with each-other.

To keep developers from falling into the common pitfalls of merging violating application invariants, the editing APIs are designed to ensure that which invariants are maintained by default is clear.
When these invariants are insufficient, the application author will always have the option to apply a constraint which will ensure than if the edit could result in a constraint violation due to a merge, it will be rejected instead of merged.
The most important of these constraints, the one which will always be enough, is to reject the edit if any other concurrent edit got sequenced before it.
Having this option available ensues the application author can always author their editing logic with confidence it won't behave unexpectedly due to concurrency, which is key to ensuring they can be productive.

This general purpose no-concurrency constraint is unfortunately not great for the "The merges apply both sets of edits" requirement.
This can be addressed by providing more specific constraints, and designing the editing APIs so constraints are needed in less cases.
For example allowing a constraint that only rejects a transaction if a field or subtree was concurrently edited, or providing a field kind with higher level editing operations like a set or counter with appropriate editing methods.

This design pattern ensures there is always a way for the application author to ensure correctness, and to improve the merge granularity when needed by doing more work to be less conservative with the constraints.

Additionally, even higher merge fidelity can be achieved by adding new field kinds as application needs for them arise, and this work can be shared among all users of SharedTree.

Note that the current implementation does not yet provide access to constraints, but this is planned for future versions.

# Sub-Trees

To help applications scale to larger schema and more complex documents, SharedTree is designed to enable applications to process different subtrees independently.
If the application aligns their data model with this, keeping invariants and operations as local to a given subtree as possible, they can benefit in several ways.
It allows for easy to express but still fine grained constraints, using subtree constraint (which reject concurrent edits to the same subtree),
as well as more efficient and simple application logic for things like producing and updating a user interface for a given subtree's content.
The part of an application which handles a given subtree can be though of as a mini application which can be nested in a larger one:
this can both be great for reuse of logic, as well as integration into other tree structured systems, like [React](https://react.dev/) or even just the [DOM](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction.)

When operations need to span different subtrees, they can be thought of as an operation at (or above) the level of their common parent, and can be constrained accordingly when needed.

---

**NOTE**

This is part of why SharedTree is a tree, and not a graph.
When dealing with mutable content, its really useful to be clear about what the invariants of any given data are.
Having these comes from its schema is ideal, but in the cases where that's insufficient, constraints can be contextually applied by the parents.
This approach is most practical when any given data only has a single context (based on its single parentage path).
In a graph, data can have many parents, so they either need to not put constraints on the child (which makes it hard to have any application invariants which the schema language can't express),
or all need to be accounted for (which doesn't scale to complex applications well).
Therefor SharedTree goes with he tree approach, where constraints and invariants are handled at the subtree level;
There are plans to support references to nodes allowing more graph like data, but these will not be able to easily put requirements on those subtrees like their parents can.

---

This subtree focused approach also helps optimizations like those mentioned in "Efficient Data Storage" to be effective and encapsulated.

Some areas of the SharedTree design that currently do not deliver ideal subtree isolation are:

-   Schema: A given schema identifier has the same meaning in the entire tree.
    This means that currently embedding two different versions of a sub-tree application in different places with mismatched schema versions might not work depending on how it versions its schema.
    Designs to address this, and some related issues (like generically parameterized collections) are referred to as "contextual schema" and could be implemented in future version of SharedTree.
-   Loading and Summarization: Currently all subtrees are downloaded and summarized together.
    Designs for "partial checkouts" are planned to address this for data loading, but there isn't a plan do address this for summarization.
-   Op transmitting and processing: All clients will receive and process all ops in the SharedTree.

# Stored and View Schema

Applications need to make assumptions about the data they are working with.
For simple in-memory cases, this is generally managed with types.
The code in the application uses those types to enable readers of the code (including other developers and compilers) to reason about and validate the logic in the application.
SharedTree provides this same experience: the application code gets to use types to reason about the document content it's working with, however it also has to deal with the fact that the document content might come from a different application or a different version of the same application (newer, older or even a divergent fork).
To ensure content from a document is not misinterpreted, the document carries with it the "stored schema", which defines the structure and editing behaviors of the content within the document.
This can be checked against the "view schema" which defines the types the application is programmed against.
If they match, the application can safely work on the document as is.
If they do not match, the application needs to take some corrective action.
The set of possible corrective actions generally includes raising a compatibility error, updating the document's schema, or adapting the document's content to a supported format.
In the general case these compatibility fixes can be done in a composable subtree local way, and form a general approach for handling schema evolution.
This approach is designed to enable separating the portion of the application that deals with compatibility, keeping the main logic of the app as clean as possible, as suggested in [SchemaVersioning](packages/dds/SchemaVersioning.md).

Importantly, the View Schema allows the application to have strong types for the document content, which helps make it clear which invariants SharedTree guarantees (mainly that the document stays in schema) and which ones the application must take action to maintain (nearly everything else).
Additionally the strong types from the view schema should help improve readability and maintainability of SharedTree powered collaborative experiences,
and the checking of the stored schema against the view schema guards against many data corruption scenarios that are common in collaborative editing scenarios.

# Efficient Data Storage

This extension point is only intended for use within the SharedTree implementation, and will start with a small set of formats which should work quite well for most applications.

Without careful design performance could become a major limitation of SharedTree.
A simple general purpose tree implementation, not optimized for any particular usage patterns, will be enough for many applications.
However, SharedTree needs to have a way to add optimizations for specific cases when they are needed.
This is key to ensuring users of SharedTree can leverage SharedTree for handling their collaboration, even for fine grained operations at the leaves where the node count can be very high relative to the data size, and per node overhead can become prohibitive.

To tackle this problem in a way that follows the compatibility and extensibility approach of separation of concerns and versioned components, Chunked Forest was created.

The goal is to ensure it is possible to provide high performance specialized tree representations that can handle specific use cases with performance that's not inhibited by being part of SharedTree.
Secondary to this is ensuring that the effort required to do this is minimized.
This means both that the baseline performance should be good enough in most cases, and the specialized cases should be as general as possible while still offering the required performance wins to reduce how many specializations are needed.

To meet this first goal (avoid any SharedTree specific overhead), the design should ensure it is possible to provide a customized fast path end to end, meaning that all the way from ops or summaries to the view access by the application, it's possible to opt into specialized formats and low level access to eliminate performance overhead incurred by the tree abstraction.
To keep ease of use, it's important that the tree abstractions are always usable (so debugging tools, non-performance-critical code, etc. can use them), and that it's simply possible for code to opt in to using optional fast paths to achieve this.
This ensures that all logic can be compared against the simple non specialized reference implementation (for example for testing the optimizations), and that it's ok if uncommon edge cases cause the specialized formats to not be used and fall back to more generic ones.

Accomplishing this goal requires specialized tree data formats or APIs at a few levels:

1. In serialized data, including ops and summaries.

    In the most general case this includes binary data which can be stored in Fluid's blob storage, so this layer is called "blobs".
    This allows different parts of the tree to use different blob formats.

2. In the in memory tree representation (Forest).

    This is handled by Chunked Forest, which implements the Forest abstraction by delegating to tree content which implements a Chunk abstraction.
    This allows different parts of the forest to use different chunk formats.
    Accessing the content of a Forest is done through Cursors.
    Specialized chunked implementations can declare support for fast path APIs via symbols to allow their user to query for and use them.

To enable efficient encoding and decoding between these formats, both are owned by chunked forest (allowing zero copy optimizations for data arrays between the two), and ref-counting is used on chunks so trees can be lazily cloned, and modified in place when only referenced once.

# Runtime Performance

Where performance costs are incurred is important.

## Application of remote edits vs creation of local edits

SharedTree is designed minimize the cost of applying edits from remote clients since any client which can't keep up with the remote edit rate is unable to collaborate.

This is most important when a client is falling behind. Thus it's very useful for clients which are behind to be able to improve their remote edit application rate via batching.
SharedTree is designed to enable this optimization in the future, but currently can not perform it as the runtime does not yet provide access to the backlog of edits which need to be processed.

Another way SharedTree is optimized for performant application of remote edits is to push as much of the cost as possible onto the creation of edits,
so it is paid by the client producing the edits, slowing down their edit stream (which reduces the burden on remote clients) as well as lowering the cost of applying those edits for the remote clients.
One way SharedTree does this is by leveraging Fluid's collaboration window limits: if applying an op would require processing too much history, the client sending the op is required to perform that work themselves to produce a more self-contained op.
The best example of this is the resubmit op flow, which has the client sending the op rebase it if it gets too old.

## Eager vs Lazy

Generally, eagerly computing things is simpler, and if they end up being required, faster.
Eager computation also often saves on memory footprint.
SharedTree assumes that the app using the tree will frequently read data, however it is designed to support use cases with large amounts of data, and applications that only read a small part of it.

Thus SharedTree aims to eagerly compute things that will be needed regardless of which data is read,
as well as eagerly compute things that are cheap enough that it is not a performance issue.

Lazily computing values can save work if they end up not being needed, but can also increase latency when first accessing them.
If this latency becomes problematic (which has not yet occurred for anything in SharedTree), pre-caching these computations can be performed when idle (for example after the JavaScript task that invalided a previously cached value).
Assuming the laziness has negligible overhead, this avoids delaying responsiveness of the app to wait for the computation when the invalidation occurs (it remains no worse than an eager implementation would be even if the value is requested) while also avoiding harming the responsiveness of an operation that might asynchronously request the value in the future.

An example of where SharedTree acts eagerly is resolving edits in the `editManager`: this optimizes for maximal remote edit throughput.
An example of where SharedTree is lazy is creating the application facing simple-tree nodes: this allows applications which only read part of the tree to avoid a lot of costs that come with large trees.
Forest is currently eager, but when support for forests which do not hold all the tree in memory is added, applying edits to non-downloaded parts will have to become lazy.

## Asymptotics

There are several different sizes which SharedTree performance scales with:

-   The depth of the tree.
    Many costs scale linearly with the depth. This includes the size of ops, the time to apply ops, stack space used in many cases etc.
    Overall extreme tree depth is not an optimization priority for SharedTree,
    however it is designed to enable amortization of depth related costs when many operations are applied within the same subtree.
    If depth related costs become problematic, increasing the ability to amortize/deduplicate depth related costs,
    as well as optimizing constant factors should be the preferred approaches.

-   The total number of nodes. SharedTree is designed to be able to eventually support trees are not fully loaded into memory any point.
    This means that functionality which all trees while require (for example merge resolution, edit application, summarization
    and reading subsets of the tree data) must be possible incurring only `O(log N)` overhead where N is the total number of nodes in the tree.
    While current forest implementations and view APIs and summary formats do not support this scalability,
    the design must ensure that it is possible to add alternative implementations with that scalability in the future.

-   Length of sequence fields.
    Optimized handling of long sequences is not currently a priority. It is however important to ensuring that it is possible to eventually support long sequences editing and indexing with at most `O(log N)` costs.
    This means that the format for edits ensures this is possible, but the actual implementation of things like AnchorSet and simple-tree may incur `O(N)` costs for now.

-   Number of fields.
    Performance related to number of fields has the same requirements as lengths of fields, at least when it come to map nodes.

-   Amount of Schema.
    Scaling to very large schema is not a priority.
    The cost/size of the schema should be amortized over the session:
    no schema proportional costs should be incurred during normal usage as part of any operation a client may do many times in a session.
    This means that in typical use, ops and summaries should not have to copy the schema.
    SharedTree assumes that the schema will always be practical to download and keep in memory.
    Schema derived data should be eagerly evaluated and cached to optimize runtime performance of content using the schema.
