# Node Identifiers in SharedTree

## Overview

Node Identifiers are "references" or "handles" to nodes in the tree. The term "identifiers" in the document always refers to "node identifiers" unless stated otherwise.

### Why Identifiers

Why use identifiers at all? SharedTree has paths, are not those already sufficient "references" or "handles" to nodes in the tree? No, a node's identifier is related to, but not the same thing as, the path to that node in the tree. A path points to a location within a tree, but it does not necessarily capture any semantic meaning about the identity of the node it points to. Consider a node A which is deleted, and then consider a node B which is inserted in the same place. Node A and Node B have the same path (although they are in different revisions) but they are not the same node; they should therefore not share the same identifier. Likewise, consider a node A which is moved from location X to location Y in the tree. Node A has a different path after the move than it did before, but it is the "same node"; it should have the same identifier in both locations.

### Timeline

There are many ways to go about implementing identifiers and many different feature sets and APIs to choose from, some more powerful but more complicated to implement than others. The conclusions in this document are motivated by SharedTree's second milestone, "MParity", at which it needs to have parity with the legacy SharedTree. At this time, many of the richer features of the SharedTree will not be implented yet, and this goes for identifiers as well. To get the best and most flexible behavior and API for identifiers, the SharedTree needs to be more complete than it will be at MParity. Thus, compromises have to be made, and the state of identifiers at MParity will be at least as good as it is in the legacy SharedTree in both API and performance, but does not need to be much better. Ideally, the implementation and APIs will be evolvable such that identifiers can be improved in the future.

## Questions

### Are Identifiers Optional?

### Are Identifiers Unique?

### Are Identifiers Exclusive?

Can one node have multiple identifiers

### Are Identifiers Immutable?

Can nodes be assigned identifiers lazily
Can nodes change identifiers

### Are Identifiers Special?




















// NOTES

Node identifiers for MParity
Assumptions:
Node identifiers are in general optional
If a node has an identifier, it must be assigned its identifier at the moment it is created
Node identifiers are immutable

Options:

Identifiers are simply a node with a value (the identifier) under a field. The field is not special other than that it is known to the index which performs identifier lookups.

Pros:
Does not require hardcoding of special identifier field keys or an identifier property on the node itself.
A user can add multiple kinds of identifiers if they wish.
No special API for reading; the identifier is just the field, so accessing it does not add to concept count and higher-level reading APIs (e.g. EditableTree) will just work

Cons:
Despite a clean reading API, the writing API still needs to be special (identifiers are only allowed to be set at node creation time, and are thereafter immutable), so the concept count for using identifiers is > 0.
Costly to have another field on every node with an ID until we get compact binary encoding of nodes (likely after MParity)
How will we implement optimizations that are targeted specifically at identifiers (e.g. sequential ID elision)?
Clients who specify an identifier field _ought_ to mark it as readonly in the schema; if they do not, it is a mistake, but we have no way to enforce this

Identifiers are a node with a value under a field (same as above), but the field _is_ special and hardcoded into SharedTree's APIs and the identifier index.

Pros:
No special API for reading; the identifier is just the field, so accessing it does not add to concept count and higher-level reading APIs (e.g. EditableTree) will just work
Attempting to write to this special field can fail, ensuring immutability.
Since the field is special and known to SharedTree, it might be able to compress it in a more straightforward or efficient way rather than relying on general node/field compression

Cons:
Despite a clean reading API, the writing API still needs to be special (identifiers are only allowed to be set at node creation time)
Potentially costly to have another field on every node with an ID until we get compact binary encoding of nodes (likely after MParity)
Optimizations that are targeted specifically at identifiers (e.g. sequential ID elision) will have to leverage a general node compression mechanism that can dispatch on certain keys or kinds of fields (likely after MParity)

Identifiers are a special, hardcoded property on node/cursor

Pros:
Ensuring immutability is simple and can be communicated at the type level: simply don't provide an API to do it.
The identifiers can be compressed in a more straightforward or efficient way rather than relying on general node compression. For example, eliding sequential IDs in build/insert operations is simple because identifiers are known to benefit from this compression technique and are therefore targeted by hand to use it.
Reading and writing APIs are consistent, i.e. identifiers are set and read both in special ways, rather than being set in a special way but read in a general way

Cons:
Higher level APIs must explicitly implement support for reading identifiers
Must be implemented by hand and cannot take advantage of general node/field compression when it is ready
