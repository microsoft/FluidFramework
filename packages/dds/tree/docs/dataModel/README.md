# Data Model

## Introduction

This document discusses how tree data is conceptually organized within the SharedTree DDS. It is primarily of interested
to Fluid developers working on SharedTree.  Most SharedTree users will interact with tree data through a pre-existing
API layer.

However, the data model may be of interest to advanced users who are implementing a specialized API (see #8989).

The SharedTree data model is closely related to, but not precisely the same as:

- The internal in-memory representation of tree data
- The serialized tree data sent across the network
- The format used to persist tree data in storage

While each of the above involve specific encodings of the SharedTree data model, the SharedTree data model itself is not
concerned with the byte-level representation.

## Requirements

### JSON Interoperability

We take it as a given that the underlying data model for the SharedTree is tree-structured data. We also agree that JSON
is the modern lingua franca of the web and services. We therefore begin with the following requirements:

1. JSON must efficiently and losslessly round-trip to and from the underlying SharedTree data model, with some caveats.
2. Deviations from JSON in the underlying SharedTree data model must be well justified.

Consequently, we require that the underlying SharedTree data model can express the following in a natural way:

- Object-like records of named properties
- Array-like sequences of consecutive items (non-sparse / index agnostic)
- null, true/false, finite numbers (f64), and strings

### Durable References

The data model must support creating inexpensive durable references to nodes within the tree.  This includes scenarios
like creating "share link" URLs or building graph-like relationships within the tree.

### Schema

The data model must encode sufficient information that the system can efficiently layer a schema-on-write policy on top
of the underlying data model (see #9282).

### Augmentation

The data model must allow a subset of collaborators to unobtrusively attach extra-schema data to the tree in a way that
is ignored (but preserved) by clients that are unaware of these augmentations.

## Model

### Node

In the SharedTree data model, each addressable piece of data is represented as a tree ***node***.  There is a single node
at the root of the SharedTree that can not be removed or replaced.

<figure align="center">
  <img src="./img/dataModel_root.drawio.svg" alt=""/>
  <figcaption>Figure: Implicit root node</figcaption>
</figure>

### Value

Each tree node has an optional ***value***.  Values are used to store scalar data, such as numbers and booleans.

<figure align="center">
  <img src="./img/dataModel_scalar_nodes.drawio.svg" alt=""/>
  <figcaption>Figure: Nodes with values</figcaption>
</figure>

From the perspective of the SharedTree data model, values are opaque.  The only tree operation that affects a node's
value is 'setValue', which overwrites a node's value with a new opaque value.

From the perspective of the broader Fluid system, node values are [*serializable*](https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/datastore-definitions/src/serializable.ts)
and are traversed by Fluid services such as garbage collection.

### Field

Each tree node has a set of zero or more fields.  Fields are used to model map-like composite type, where each  ***field***
represents one relationship between a parent node and an ordered ***sequence*** of one or more children.

<figure align="center">
  <img src="./img/dataModel_children.drawio.svg" alt=""/>
  <figcaption>Figure: A parent node with two fields</figcaption>
</figure>

The fields of a node are distinguished by a ***key***.  Fields of the same node are distinguished by a field key.  From
the data model's perspective, field keys are opaque.

### Sequences

In the SharedTree data model abstraction, there is no distinction between a field that always contain a single child and
a field that can contain multiple children.  Instead, SharedTree treats all fields as ordered collections and uses schema
to restrict which fields are optional, must contain a single value, or may contain multiple values.

When mapping the SharedTree data model to conventional programming languages, it is sometimes helpful to think of the
sequence as being distinct from the field, as if each field points to an ***implicit sequence*** object.

However, it is important to remember that sequences are not tree nodes.  This means that sequences are not directly
addressable.  The combination of the field + sequences is implicitly created when the first item is inserted, implicitly
deleted when the last item is removed, and may only be referenced indirectly via the combination of parent node + field key.

### Special Fields

This section covers fields that receive special treatment in the SharedTree data model.  These fields are special because:

- They have well-known keys
- They are universally available on all nodes (regardless of schema.)
- They can not be targeted by normal tree operations.

#### Type

The SharedTree data model supports nominal typing via a special *type* field.  The value of the *type* field is the unique
identifier of the corresponding schema type.

In the data model abstraction, the value of the type field is opaque.  However, there is a set of well-known types
(*boolean*, *number*, etc.) that are transparent to the underlying implementation.

#### Id

The SharedTree data model supports durable references to tree nodes via a special *id* field.  The *id* field is used by
SharedTree to provide a bidirectional *id* ⟷ *node* index that provides efficient lookup of nodes by id.  This is the
underlying building block for features like "share link" URLs and graph-like references within the tree.

## JSON Comparison

The below diagram highlights the differences between the JSON data model and the SharedTree data model using the following
snippet:

```json
{
    "visible": true,
    "text": "cat",
    "dashStyle": [0.5, 3]
}
```

![Figure 1](img/dataModel.drawio.svg)

Of note:

- Scalar values are represented by tree nodes and consequently have a durable identity.
- The 'visible' field is a sequence, even though it is constrained by schema to only contain a single boolean value.
- The 'text' field leverages it's implicit sequence to represent the letters of "cat" as individual nodes, allowing the
text to be collaboratively edited in the same way as array.
- Unlike the 'text' field, an explicit tree node is used to represent the JavaScript array object.

# Appendix A: Notes

- We chose the term 'field' in because it is convenient to have a term that is distinct from the 'properties' that result
when the domain model is projected to an API.  ('field' also happens to align with GraphQL.)
- We chose the term 'key' because it sounds more opaque than 'name' or 'label', both of which conjure the notion of
something that is human readable.
