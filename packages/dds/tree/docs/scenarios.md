# Shared Tree Usage Scenarios

This document serves as a place to collect and discuss various usage sceneries for Shared Tree.
There are several different perspectives from which we can enumerate Shared Tree usage scenarios
as well as several different reasons to enumerate such scenarios.
Each section below covers only a portion of this space.
Sections can be added or extended as more needs arise.

## Performance

### Data Modeling and Special Case Optimizations

This section is included in this document since the performance and the ability and need to optimize are massively impacted by how the data is modeled.

In general, you can capture any data model, and edit it however you want in tree, but some ways to encode the document will perform (and merge) better than others.

If the document's structure and contents accuracy capture the intentions/thoughts of the user, without duplication, then the size of the document should be proportional to the actual novel information that it contains (there is of course some overhead based on the encoding efficiency, but it should be a constant multiplicative factor).
Such a document should also be able to be edited in such a way that a user changing their mind about what should be in the document should be expressible in a way that its encoded size is proportional to the inherent complexity of this thought, and be applied in time proportional to that as well.

The idea is also similar to [normalization in databases](https://en.wikipedia.org/wiki/Database_normalization).
Well factored source code is another example of such a document.
Such normalization in practice is rarely perfect though, for example code bases sometimes have simple refactoring (like renaming an API) causing large diffs, and databases often need schema changes, or denormalize for performance reasons.

With Shared Tree we attempt to provide the tools to try and make documents which are such normalized semantic models, and have the corresponding performance characteristics.

Additionally we want to provide the tools to embed and handle other kinds of data with reasonable efficiency, with the option of adding optimizations for special cases when doing so is worth the effort and complexity.
These optimizations should be able to expose as as nice of API and as much performance as would be practical if Shared Tree weren't involved, meaning that they should be able to provide the same or better performance as a dedicated Fluid DDS could for the sections of the tree they apply to.

These optimizations need to be modular (so adding more does not increase the complexity of other code), and possible enable even after existing documents have data in the non-optimized forms.

The optimizations will mainly come in three forms: (TODO: relate these to roadmap and actual APi surfaces).

-   Improvements to constant factors for common cases:
    -   Generic (not specific to particular node type) patterns.
        For example:
        -   dedicated chunk formats for sequences where most of the values have the same type/shape.
        -   deduplication of path prefixes when editing nearby parts of the tree.
        -   hints for how to chunk data to improve access times, memory use and write amplification.
        -   deduplication of shape/schema information for trees where many subtree portions have the same shape.
        -   alternatives to EditableTree specialized for interacting with specific frameworks (ex: React).
    -   Optimized versions of specific types.
        For example strings (sequences of unicode characters) could get some special optimizations beyond normal uniform sequence optimizations since they likely want variable with characters, and fast access to the data as a string, which makes them not fit the general optimizations as well.
-   Asymptotic improvements via higher level edits.

    Some kinds of edits end op scaling poorly, and commonly used cases could be optimized. Some examples:

    -   Undo / Redo and changes to resolve merge conflicts could all have asymptotic size improvements by having ways to reference trees which already exist in the history.
    -   Some applications might have data models which where they want to edit large amounts of document content in whats that can be expressed concisely in declarative ways (ex: find and replace, sorting, filtering, converting etc.).

        Dedicated operations formats and/or declarative DSLs can be added to address these cases.
        This can require defining and implementing all the merge behavior and versioning, so adding such functionality has a lot of the complexity of adding a custom DDS for it (should be no worse though), and this can be partially mitigated with libraries.

### Performance Sceneries

This section lists example shared tree usage patterns, and highlights what aspects of these will be important for performance.

As much as possible these aspects should form an [orthogonal basis](https://en.wikipedia.org/wiki/Orthogonal_basis) for real world performance of shared tree in applications.
In cases where this is not practical, coverage of the space is more important than orthogonality.

This means that any performance issues in applications due to shared tree should be able to be expressed as a combination of the sceneries listed here.

This also means theoretical future uses of Shared Tree should be able to be compared to this list, to find the relevant sceneries.
From them, the table should make it possible to:

-   find (or request the implementation of) the relevant benchmarks to get a rough idea of the expected performance.
-   determine what items from [the roadmap](./roadmap.md) will impact the scenario, and the expected scalability before and after them.

This is intended to allow potential users of shared tree evaluate with confidence how their planned usages will perform, both now and at various points along the [the roadmap](./roadmap.md).
This in turn should allow such users to provide feedback on the roadmap, the overall design, and decide if shared tree is appropriate for their proposed scenario.

If there are aspects of your application performance concerns that you are unable to decompose into the operations listed here, please add them to this document, or open an issue explaining your issue.

**_Status Note:_**: This section is early in its authoring, and most of the supporting benchmarks and roadmap items do not yet exist. Despite this, if you have a particular scenario of interest you want prioritized (or even just included) here, feedback about this would still be useful.

#### Opening Documents

There are three main costs of opening a document:

-   fixed costs: these can be measured by opening a small or empty document. Optimizing this involves optimizing:

    -   code size and delay loading and parallel loading of code
    -   network round trips (for both code and data)
    -   initial setup performance (actual CPU time for setup)
    -   caching (ex: webpack bundle reuse)

-   document content loading costs: for each index these are impacted by:
    -   total document size (actual total byte count)
    -   encoding efficiency (how much data fits in a given byte count)
    -   data needed in initial load (for milestone 2 will just load entire document: later versions may load less)
    -   read parallelization
    -   read efficiency (what portion of the chunks downloads is part of the required data)
    -   memory use for in memory format
    -   time to parse the data into the in memory format
-   overhead for exposing the data to the application: For milestone 2 this will strictly be via the editableTree API.
    -   in memory representation overhead for intermediate format (including any needed registrations for invalidation, and references back to the forest for lazily reading more data)
    -   app facing API performance overhead (Currently this is the biggest concern for milestone 2 performance)

A fully lazy editable-tree (like the current implementation) seems ideal, but requires an efficient way lazily expand it when requested.
More efficient anchor or cursor cloning would be required for this.

A fully eager one could also be provided for applications which don't use partial checkouts, and may have lower overhead due to not needing to fork cursors.
This approach is suitable for milestone 2.
It could update from deltas reusing code from object-forest.
It could later be augmented with schema based hints to introduce laziness in a targeted way.

#### Editing Large Documents

With the sections below for specific tree shapes, this can focus on simple relatively balanced trees.

#### Large numbers of Collaborators

TODO

#### Large numbers of Edits

Each edit has several different associated costs:

-   Creation: incurred while running the transaction.
-   Submission: incurred serializing and sending the Op to Fluid.
-   Processing: download, parsing and rebasing of the edit.
-   Application: applying the edit to the current application state.

This breakdown motivates two test sceneries:

-   Creating lots of edits.
-   Processing lots of remote edits.

The first case can have back-pressure (TODO: roadmap item), and is a cost a client causes itself to have to pay.
The second is more problematic: falling behind on remote edit processing causes a client to have to drop out of the session and rejoin at a later summary to catch up (TODO: make sure that actually works).

Thus the scalability requirements for this second case are very high.
Fortunately it benefits from not including `Creation` or `Submission` and batching of `Application`.

Thus the editing process should be optimized for fast `Processing`, and large batch aggregation and `Application`.
TODO: roadmap items for related optimizations (ex: caching squashed edits to rebase over, and squashing edits to rebase as groups)
TODO: throughput benchmarks.

TODO: Actual edit creation end to end also needs benchmarks.

#### Deep Paths

(Experimental shared tree has no path depth scaling issues: may need some of this for milestone 2 for parity)

The cost of high tree depth (long paths) should able to be reduced and amortized in several ways:

-   TODO: list approaches and roadmap items here.

This needs to be tested with editing and viewing.

#### Long Sequences

(Not optimized for milestone 2)

Long sequences can have performance issues.
It is planned (TODO: link to roadmap) to address these by allowing long sequences to be encoded as balanced trees.
Once this is done, benchmarks can be provided to ensure long sequences perform comparably to balanced trees of the same size (for editing, storage, reading, partial checkouts etc). TODO: reference benchmarks here.
This allows this optimization to tested specifically and not need to be separately characterized in the other sceneries.

Performance should be able to be comparably to a dedicated sequence DDSs.

#### Many Fields

(Not optimized for milestone 2)

Nodes with many fields will be optimized the same as Long Sequences (TODO: link to roadmap).

Performance should be able to be comparably to dedicated map DDSs.

#### Uniform Data

(Milestone 2 needs at least field-key and type name dedupe in serialized formats: achieve this with schema compressed chunks in forest?)

Data which is uniform, like a sequence where all members are the same type and have the same size of data,
should get performance comparable to what would be achievable if it were simple encoded in a specialized binary format,
and not as a general purpose tree.

This means no `O(data size)` encoding or editing overheads by deduplicating shape and schema information.
A shape deduplicating binary chunk format should achieve this.
TODO: roadmap item.
TODO: benchmarks for how bad this is currently (space and editing perf vs dedicated formats).

If the data itself is compressible, custom "chunk formats" can be added to `forest` to support that if required which would enable closing any remaining performance gaps with special purpose systems (ex: support for viewing compressed formats like `png` as trees).
Support for such specialized domain specific formats is not a planned feature, but it fits into the planned architecture (just like mopre general compressed formats) and could be done if the need arises.

One case that might be worth a specialized format is Strings.
It may be possible to get string handling with general tools (ex: uniform sequence compression) good enough,
but the variable length encoding of uft-8 might need extra feature to accommodate efficiently.

Domain code reading compressed data should be able to do so efficiently.
This means exposing optional chunk formats specific access to the compressed data as a fast path API.
Strings need to be made to work well with this, but so should other types.
Benchmarks (TODO) should be provided to ensure that this fast path mitigates any overhead the more general path would incur,
allowing for near native performance for things like string access.
