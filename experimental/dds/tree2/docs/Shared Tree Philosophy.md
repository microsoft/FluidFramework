# Shared Tree

The goal of the shared tree project is empower developers to create and maintain better collaborative experiences.

To best achieve this goal we plan to deliver a set of libraries that enable developers to:

-   Productively create and maintain collaborative experiences.

    Doing this "productively" means ensuring that developers will be directed into using patterns that work well for collaborative applications,
    and ensuring that useful supporting libraries are in place to make this a good experience.

-   Easily learn how to use the libraries without relying on prior experience with collaboration tools.

    Using the libraries should teach what is needed when its needed rather than requiring collaboration specific knowledge or experience as a prerequisite.
    The learning curve should be fast enough to be productive on day one, both for maintaining existing experiences or authoring new ones.

-   Avoid common pitfalls of collaborative software.

    Collaboration often introduces subtle requirements, especially around compatibility, updates, offline use, error cases, persistance and concurrency.
    Picking the right design patterns (above) as well as explicitly drawing attention to particular details in the API design, documentation and examples all need to work together to holistically guide developers into creating experiences that collaborate correctly.
    Additionally, the resulting experiences need to be maintainable, including easy authoring of new features and reviewing of changes for possible collaboration issues.
    For code authors, it should be easy to find the right way to do something, and know it will be robust.
    For code reviews, it should be obvious in review, only looking at the changed code, if it might introduce a collaboration related issue (such as unexpected merge behavior, issues collaborating with previous or future versions of the app, inability to open old document, etc.).
    This needs to be true, even for a novice users of shared tree without experience writing collaborative experiences.

    One way this is achieved is to ensure work and requirements specific to collaboration support will be easy to discover when relevant and easy learn about and handle when needed.
    For example, if adding a new editing operation, it should be obvious how to ensure the required application invariants hold—even across merges—, and what the implications are for deployment and cross version collaboration.

-   Adopt Shared Tree without concern for having to migrate to another solution due to hitting limitations.

    This means that if a developer wants to make a change that interacts with collaboration, the fact that their application is powered by shared tree will not be a limiting factor on what can be achieved.
    This includes compatibility between different application or version of an applications, scalability, availability, merge quality etc.
    More concretely, if faced with a new application collaboration requirement, it should be practical to either build it on top of shared tree or extend shared tree to support it.
    Doing this should not require major reworking of either the application or shared tree implementations, not require extending it in a way that the upstream shared tree would not be willing to maintain.

-   Generalize investments into improved user experiences across many different application.

    As much as possible, shared tree should serve as a framework for sharing generalized collaborative logic, and a good default library of such logic.
    For example merge resolution strategies, compatibility adapters, debug tools, common schema etc, can be generalized for easy use by all users of Shared Tree.
    Users of shared tree can start by authoring their own specialized version of any of these (if needed), and then consider generalizing them as either independent libraries or upstream contributions.

Another way to describe these goals is that Shared Tree needs to be able to be **adopted with confidence**.
Once adopted, it must be **easily learnable** and **productive** for developers new to collaborative application while being **flexible** in what it supports and produce **robust** and **high quality** collaborative experiences.

In addition to these overall goals, Shared Tree also needs to provide an MVP early in the development and internally be **maintainable** and **extensible**.
This allows it to deliver value early, but also continue to be developed to reduce the development effort required of application authors to improve the experience it enables for end users.
These internal requirements mostly follow from the above flexibility requirement, but are worth the extra emphasis.

# Implications of these Goals

Commonly desired collaboration features should be easy for applications to support, but when supporting them requires extra work, they can be explicitly opted out of or deferred to a future version.

This include features like:

-   cross version collaboration support to enable incremental rollout of updates.
-   compatibility between different applications, including when those applications evolve their schema.
-   fine grained and/or customized merge resolution.
-   support for offline use.
-   ensuring specific application data invariants hold.
-   scaling to large datasets.
-   services to accelerate some operations (like summarization, search etc).

Shared Tree's approach to doing all this while being extensible and maintainable relies on modularity and versioning, and is covered below.

# A Design For Extensibility and Compatibility with Versioning

Shared tree is a collaborative data-structure allowing cross version collaboration as well as support for loading all old formats.
This imposes some very strict compatibility requirements that can make changing its implementation and functionality difficult.

This puts a large tension between maintainability and extensibility.
This leads to a design that is focused on optimizing for extensibility while minimizing the difficult of maintaining compatibility across these extensions.
The approach Shared Tree takes for this is separation of concerns and version-ability of components.

Concepts are split into three catagories based on compatibility requirements (see [SchemaVersioning](packages/dds/SchemaVersioning.md) for details of why these exist and what is in each):

1. Critical for consistent behavior and thus must have compatibility forever to support old document and cross version collaboration.
2. Only impacts the current instance of the application, and can be changed without maintaining identical behavior in previously supported cases.

The Shared Tree design minimizes the amount of stuff (code, formats, data, etc) in the first category, as well as to keep the items in the first category as simple and independent as practical.

For example, the merge resolution logic for sequences is defined as a single component, and if it needs changes that are incompatible (for example an improvement,ent to merge resolution), its possible to simply author a new version of this logic, and select between both at runtime based on either protocol version or schema.

Additionally the Shared Tree architecture organizes these components such that if needed they can be replaced incrementally.
For example, the tree reading and editing API is build on-top of cursors.
A different version of this API can be authored, tested and adopted side by side with the old one with minimum difficulty.
If the underlying tree storage (`forest`) changes, the tree API components (`editable-tree`) will not be impacted.
Similarly if the cursor API needed to change, forest could add support for the new one (without dropping the old one), then users could migrate incrementally.
This kind concurrent multi-version support is extra important for cases which fall into category one above (impact data compatibility not just API compatibility).
For example shared tree can introduce a new version of editing primitives and/or merge semantics for a field kind (for example sequence, see below),
which applications can opt into in their schema in a compatible way.

Shared Tree is also designed to ensure applications using it can also adopt this same compatibility approach if needed while minimizing the frequency its required as well as the difficulty of doing it.
This has the largest impact around application schema evolution (changing the schema the application uses to view and edit documents).

## Bipartite Tree and Field Kinds

When users edit documents, those high level semantic operations need to be encoded in a way that supports merges.
Additionally this encoding needs to be deterministically applied in all clients, even if they are using different version of Shared Tree.
This needs to be done such that when desired, applications can ensure invariants hold.
This means the editing and merge logic must be kept identical for compatibility, and changes to it instead have to be strictly new cases being supported:
for example new edit operations can be added or new configuration flags added to existing ones can be added, but how a particular merge gets resolved can not be changed without introducing a compatibility issue.
This can get complicated, so to keep it manageable, this problem was subdivided in a few different ways.

The data-model for Shared Tree was selected to assist with subdividing this problem.
The selected data-model consists of many small structures where collaborative edits interact—fields—, and nodes which connect them into a hierarchy and assigns types to each of the fields.

The nodes have schema which define the schema for their fields.
There are a few [kinds](<https://en.wikipedia.org/wiki/Kind_(type_theory)>) of nodes configure their fields differently, for example like structs (with a fixed set of mixed field types) or maps (with an extensible set of matching field types).

There are also a few kinds of fields which provide different collaborative data-structures (like `sequence`, or `optional`), each of which hold nodes.

All of the editing is done in the fields via the `field kind`.
This allows the editing logic, both API and merge policy, to be packaged together into minimal versionable units ( `field kinds`).
Since the schema explicitly selects what field kinds to use, updating of them is opt in, and can be coordinated with deployment schedules to achieve the required cross version collaboration requirements.
This also leverages all the same collaboration as the rest od schema evolution, making adopting alternative field kinds no different from updating other aspects of the application's schema.

This results in a tree where the overall shape is controlled by the application via its tree schema (for the nodes), but its made of alternating layers of fields provide all the complex logic, neatly separating the concerns.
This can also be thought of as a tree of entities alternating between fields and nodes.
As these two kinds of entities alternate and thus never touch, this resembles a [Bipartite Graph](https://en.wikipedia.org/wiki/Bipartite_graph), and can be called a Bipartite Tree.

# Constraints and Sub-Trees

When users edit documents, those high level semantic operations need to be encoded in a way that supports merges.
Applications need to be able to easily ensure the invariants they require will be maintained across merged, and (possible with some effort) high fidelity merge resolution should be achievable.

Ideally the built in merge resolution will be sufficient to ensure the application invariants hold (see "Field Kinds" below), however this won't always be the case.
Thus an additional tool is required: "Constraints".
Constraints are used to specify what concurrent edits could cause an unacceptable merge result.
The constraints API (status: its not finished yet) allows defining a constraint that is sufficiently conservative, meaning that it will detect all concurrent edits that could possible be an issue, but might include some that would be fine.
The most basic constraint, that nothing has changed, will detect any concurrent edit, and the application can opt into refining that to allow concurrent edits it knows are safe.
For example for many transactions, edits to unrelated subtrees are safe, so only constraining the smallest impacted subtree makes sense.
Furthermore, for most simple transactions, like operations impacting a single field, its likely the built in merge resolution and automatic field level constraints will be sufficient (for example setting an optional value could pick last write wins semantics, and not need any additional constraints, or might use a first write wins approach, and automatically get a constraint that the field hasn't changed).

One of the reasons SharedTree is a tree (not a graph or something else) is forcing clear ownership and scoping based on the tree structure enables effective and intuitive constraints.

Logically different subtrees are independent of each-other, and when operations do span them, both sides or a common parent can be constrained as needed.

Users of Shared Tree are encouraged to factor their applications in this tree structured pattern as well, allowing subtrees to be passed into the relevant application components.
This helps enable reuse of application components withing and across shared tree applications, as well as best enables optimizations like those mentioned in "Efficient Data Storage" to be effective and encapsulated.

Some areas of the SharedTree design that currently do not deliver ideal subtree isolation are:

-   Schema: A given schema identifier has the same meaning in the entire tree. This means that currently embedding two different versions of a sub-tree application in different places with mismatched schema versions might not work depending on how it versions its schema. Designs to address this, and some related issues (like generically parameterized collections) are referred to as "contextual schema" and could be implemented in future version of SharedTree.
-   Loading and Summarization: Currently all subtrees are downloaded and summarized together.
    Designs for "partial checkouts" are planned to address this for data loading, but there isn't a plan do address this for summarization.
-   Op transmitting and processing: All clients will receive and process all ops in the shared tree.

# Stored and View Schema

Applications need to make assumptions about the data they are working with.
For simple in memory cases, this is generally managed with types.
The code in the application uses those types to enable readers of the code (including other developers and compilers) reason about and validate the logic in the application.
Shared Tree provides this same experience: the application code gets to use types to reason about the document content its working with, however it also has to deal with the fact that the document content might come from a different application or a different version of the same application (newer, older or even a divergent fork).
To ensure content from a document is not misinterpreted, the document carries with it the "stored schema", which defines the structure and editing behaviors of the content within ghr document.
This can be checked against the "view schema" which defines the types the application is programmed against.
If they match, the application can safely work on the document as is.
If they do not match, the application needs to take some corrective action.
The set of possible corrective actions generally includes raising a compatibility error, updating or adapting the document to a supported format.
In the general case these compatibility fixes can be done in a composable subtree local way, and form a general approach for handling schema evolution.
This approach is designed to enable separating the portion of the application that deals with compatibility, keeping the main logic of the app as clean as possible, as suggested in [SchemaVersioning](packages/dds/SchemaVersioning.md).

Importantly, the View Schema, allow the application to have strong types for the document content, which helps make it clear which invariants Shared Tree guarantees (mainly that the document stays in schema) and which ones the application must take action to maintain (nearly everything else).
Additionally the strong types from the view schema should help improve readability and maintainability of Shared Tree powered collaborative experiences,
and the checking of them against view schema guards against may data corruption sceneries that are common in collaborative editing scenarios.

# Efficient Data Storage

This extension point is only intended for use within the Shared Tree implementation, and will start with a small set of formats which should work quite well for most applications.

Without careful design performance could become a major limitation of Shared Tree.
A simple general purpose tree implementation, not optimized for any particular usage patterns, will be enough for many applications.
However, shared tree needs to have a way to add optimizations for specific cases when they are needed.
This is key to ensuring users of shared tree can leverage shared tree for handling their collaboration, even for fine grained operations at the leaves where the node count can be very high relative to the data size, and per node overhead can become prohibitive.

To tackle this problem in a way that follows the compatibility and extensibility approach of separation of concerns and versioned components, Chunked Forest was created.

The goal is to ensure it is possible to provide high performance specialized tree representations that can handle specific use cases with performance thats not inhibited by being part of Shared Tree.
Secondary to this is ensuring that the effort required to do this is minimized.
This means both that the baseline performance should be good enough in most cases, and the specialized cases should as general as possible while still offering the required performance wins to reduce how many specializations are needed.

To meet this first goal (avoid any shared tree specific overhead), the design ensure it is possible to provide a customized fast path end to end, meaning that all the way from ops or summaries to the view access by the application, its possible to opt into specialized formats and low level access to eliminate performance incurred by the tree abstraction.
To keep easy of use, its important that the tree abstractions are always usable (so debugging tools, non performance critical code, etc. can use them), and that its simply possible for code to opt in to using optional fast paths to achieve this.
This ensures that all logic can be compared against the simple non specialized reference implementation (for example for testing the optimizations), and that its ok if uncommon edge cases cause the specialized formats to not be used and fall back to more generic ones.

Accomplishing this goal requires specialized tree data formats or APIs at a few levels:

1. In serialized data, including ops and summaries.

    In the most general case this includes binary data which can be stored in Fluid's blob storage, so this layer is called "blobs".
    This allows different parts of the tree to use different blob formats.

2. In the in memory tree representation (Forest).

    This is handled by Chunked Forest, which implements the Forest abstraction by delegating to tree content which implements a Chunk abstraction.
    This allows different parts of the forest to use different chunk formats.
    Accessing the content of a Forest is done through Cursors.
    Specialized chunked implementations can declare support for fast path APIs via symbols to allow their user to query for and use them.

To enable efficient encoding and decoding between these formats, both are owned by chunked forest (allowing zero copy optimizations for data arrays between the two), and ref-counting is used on chunks so trees can be lazily closed, and modified in place when only referenced once.
