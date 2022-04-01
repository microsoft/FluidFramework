# Data Model

## Introduction

This document discusses how tree data is conceptually organized within the SharedTree DDS. It is primarily of interested to Fluid developers working on SharedTree as most SharedTree users will interact with tree data through a pre-existing API layer. However, it may also be of interest to advanced SharedTree users who implement specialized API implementations (see #8989).

The SharedTree data model is closely related to, but not precisely the same as:

- The internal in-memory representation of tree data
- The serialized tree data sent across the network
- The format used to persist tree data in storage

While each of the above involve specific encodings of the SharedTree data model, the SharedTree data model itself is not concerned with the byte-level representation.

## Requirements

### JSON Interoperability

We take it as a given that the underlying data model for the SharedTree is tree-structured data. We also agree that JSON is the modern lingua franca of the web and services. We therefore begin with the following requirements:

1. JSON must efficiently and losslessly round-trip to and from the underlying SharedTree data model, with some caveats.
2. Deviations from JSON in the underlying SharedTree data model must be well justified.

Consequently, we require that the underlying SharedTree data model can express the following in a natural way:

- Object-like records of named properties
- Array-like sequences of consecutive items (non-sparse / index agnostic)
- null, true/false, finite numbers (f64), and strings

### Durable Interior References

The data model must support creating inexpensive durable interior references to tree content.

### Schema

The data model must encode sufficient information that it is possible to enforce a schema-on-write policy in a distributed fashion (see #9282).

### Augmentation

The data model must allow a subset of collaborators to unobtrusively attach extra-schema data to the tree in a way that is ignored (but preserved) by clients that are unaware of these augmentations.

## Tree Model

In the SharedTree data model, each addressable piece of data is represented as a tree ***node***. Note that this includes scalar values, like numbers and booleans, which are also represented as tree nodes.

### Properties

Each tree node has a set of zero or more ***properties*** that associate the node with its children. Each node property is distinguished by a ***key*** and contains an ordered sequence of zero or more child nodes.

Properties keys must be unique within a node, which means that no two properties of the same node may share a key. However, it is a best practice to reuse keys when different nodes have properties with the same semantic meaning.

### Value

Each tree node optionally also has an associated *value*. Values are opaque binary blobs used to store scalars like numbers and booleans.

### Type

All tree nodes have an associated type which is used by the API and application layers to map subtrees in the data model to corresponding domain/schema types.

### Identity

Tree nodes may optionally have an identity. Identities enable durable interior references to tree content. Identities are assigned at creation and immutable.
