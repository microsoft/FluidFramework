---
title: Overview of Distributed Data Structures
menuPosition: 1
---

The Fluid Framework provides developers with distributed data structures (DDSes) that automatically ensure that each
connected client has access to the same state. The APIs provided by DDSes are designed to be familiar to programmers
who’ve used common data structures before.

When using a DDS, you can largely treat it as a local object. You can add data to it, remove data, update it, etc.
However, a DDS is not just a local object. A DDS can also be changed by other users that are editing.

Choosing the correct data structure for your scenario can improve the performance and code structure of your application.
Below we've enumerated the data structures and described when they may be most useful.

## Key-value Data

These DDSes are used for storing key-value data. They are optimistic and use a last-writer-wins merge policy.

* [SharedMap]({{< relref "/docs/apis/map/sharedmap.md" >}}) - a basic key-value data structure
* [SharedDirectory]({{< relref "/docs/apis/map/shareddirectory.md" >}}) – a SharedMap with hierarchical paths instead of
simple keys
* [SharedCell]({{< relref "/docs/apis/cell/sharedcell.md" >}}) – a “single-object SharedMap”; useful for wrapping objects.

### Key Value Scenarios

Key-value data structures are the most common choice for many scenarios.

* user preference data
* current state of a survey
* the configuration of a view

### Common Issues

* Storing a counter in a map will have unexpected behavior. Use the SharedCounter instead.
* Storing a lot of data in one key-value entry may cause performance issues. Each update will update the entire value.
Try splitting the data across multiple keys
* Storing arrays, lists, or logs in a key-value entry may lead to unexpected behavior because users can't collaboratively
modify parts of one entry. Try storing the array or list data in a SharedSequence or SharedInk

## Sequences

These DDSes are used for storing sequential data. They are optimistic.

* [SharedNumberSequence]({{< relref "SharedNumberSequence" >}}) – a sequence of numbers.
* [SharedObjectSequence]({{< relref "/docs/apis/sequence/sharedobjectsequence.md" >}}) – a sequence of objects.
* [SharedMatrix]({{< relref "SharedMatrix" >}}) – a data structure to efficiently use two-dimensional tabular data.
* [SharedString]({{< relref "SharedString" >}}) – a specialized data structure for handling collaborative text.

Sequence data structures are useful when you'll need to insert data in the middle of a list or array. Unlike the
key-value data structures, sequences have a sequential order and can handle simultaneous inserts from multiple users.

### Sequence Scenarios

* Text editors
* Tabular data
* Timelines
* Lists

## Specialized data structures

* [SharedCounter]({{< relref "SharedCounter" >}}) – a counter.

    The SharedCounter is useful to keep track of increments. While a key-value data structure appears like a good fit,
    two users simultaneously setting the same key can cause issues.

* [Ink]({{< relref "/docs/apis/ink/ink.md" >}}) – a specialized data structure for ink data.

    Ink is a specific form of an append only list. It's great for capturing ink strokes.


## Consensus Data Structures

These DDSes are **not** optimistic. Before a change to a consensus data structure is confirmed, the connected clients
must acknowledge the change.

* [OrderedCollection]({{< relref "/docs/apis/ordered-collection" >}}) - an ordered queue of items, but each item is pulled
off the queue by only one client
* [RegisterCollection]({{< relref "/docs/apis/register-collection" >}}) - Stores values, but keeps a record of all changes
* Quorum - Allows clients to agree on a proposal. Quorum also contains client information

### Consensus Scenarios

People use consensus data structures to guarantee that only one client does an action, or that all clients consent to
an action.

Typical scenarios require the connected clients to "agree" on some course of action.

* Import data from an external source (multiple clients performing this could lead to duplicate data)
* Upgrade a data schema (all clients agree to simultaneously make the change)


## Experimental Data Structures

{{< BetaFlag >}}

### Property DDS

[PropertyDDS](https://github.com/microsoft/FluidFramework/tree/main/experimental/PropertyDDS) represents the managed
data in a typed, hierarchical data model called a *PropertySet*. This model has many similarities to JSON, but is a
richer model, which adds more fine-grained types, additional collection types, references and gives the ability to use
schemas to describe the structure of properties.

A PropertySet is a tree structured data model in which every node of the tree is a property. More documentation on this
DDS will be available over time.
