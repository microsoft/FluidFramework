# @fluid-internal/tree

This DDS is not yet ready for public consumption. See (#8273)[https://github.com/microsoft/FluidFramework/issues/8273].

## Motivation

There are a lot of different factors motivating the creation of this Tree DDS.
A wide variety of possible consumers (across several companies) have overlapping feature requirements
which seem like they can best be met by collaborating on a single feature rich tree implementation powered by Fluid.
The current feature focus is on:

- Semantics:
    -   High quality semantic merges, including "slice" moves of parts of sequences.
    -   Transactionality.
    -   Support schema in a semantically robust way.
- Scalability:
    -   Support for partial checkouts: allow efficiently viewing and editing parts of larger datasets without downloading the whole thing.
    -   Ability to easily (sharing code with client) spin up optional services to improve scalability further (ex: server side summaries, indexing, permissions etc.)
    -   Efficient data encodings.
- Expressiveness:
    -   Efficient support for moves, including moves or large sections of large sequences, and large subtrees.
    -   Support history operations (ex: undo and redo).
    -   Flexible schema system that has design patterns for making schema changes over time.
- Workflows:
    - Good support for offline.
    - Optional support for branching and history.
- Extensibility: future users will have needs beyond what we can afford to support in an initial version and must be practical to accommodate. This includes things like:
    - New field kinds to allow data-modeling with more specific merge semantics (ex: adding support for special collections like sets, or sorted sequences)
    - New services (ex: to support permissions, server side indexing etc.)

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
