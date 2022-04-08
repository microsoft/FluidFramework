---
title: Types of distributed data structures
menuPosition: 1
---

The Fluid Framework provides developers with distributed data structures (DDSes) that automatically ensure that each
connected client has access to the same state. The APIs provided by DDSes are designed to be familiar to programmers
who've used common data structures before.

{{% callout note %}}

This article assumes that you are familiar with
[Introducing distributed data structures]({{< relref "dds.md" >}}).

{{% /callout %}}

A distributed data structure behaves like a local data structure. Your code can add data to it, remove data, update it,
etc. However, a DDS is not a local object. A DDS can also be changed by other clients that expose the same parent
container of the DDS. Because users can simultaneously change the same DDS, you need to consider which DDS to use for
modeling your data.

{{% callout note "Meaning of 'simultaneously'" %}}

Two or more clients are said to make a change *simultaneously* if they each make a change before they have received the
others' changes from the server.

{{% /callout %}}

Choosing the correct data structure for your scenario can improve the performance and code structure of your application.

DDSes vary from each other by three characteristics:

- **Basic data structure:** For example, key-value pair, a sequence, or a queue.
- **Client autonomy vs. Consensus:** An *optimistic* DDS enables any client to unilaterally change a value and the new
  value is relayed to all other clients. But some DDSes only allow a change if it is accepted by other clients by a
  consensus process.
- **Merge policy:** The policy that determines how conflicting changes from clients are resolved.

Below we've enumerated the data structures and described when they may be most useful.

## Key-value data

These DDSes are used for storing key-value data. They are optimistic and use a last-writer-wins merge policy. Although
the value of a pair can be a complex object, the value of any given pair can only be changed whole-for-whole.

- [SharedMap][] -- a basic key-value data structure.

### Key Value Scenarios

Key-value data structures are the most common choice for many scenarios.

- User preference data.
- Current state of a survey.
- The configuration of a view.

### Common issues and best practices for key-value DDSes

- Storing a counter in a map will have unexpected behavior. Use the SharedCounter instead.
- Storing arrays, lists, or logs in a key-value entry may lead to unexpected behavior because users can't
  collaboratively modify parts of one entry. Try storing the array or list data in a SharedSequence or SharedInk.
- Storing a lot of data in one key-value entry may cause performance or merge issues. Each update will update the entire
  value rather than merging two updates. Try splitting the data across multiple keys.

### Sequence scenarios

- Tabular data
- Timelines
- Lists

### Common issues and best practices for sequence DDSes

- Store only immutable data as an item in a sequence. The only way to change the value of an item is to first remove it
  from the sequence and then insert a new value at the position where the old value was. But because other clients can
  insert and remove, there's no reliable way of getting the new value into the the desired position.

## Strings

The SharedString DDS is used for unstructured text data that can be collaboratively edited. It is optimistic.

- [SharedString][] -- a data structure for handling collaborative text.

### String scenarios

- Text editor

## Specialized data structures

- [SharedCounter][] -- a counter.

  The SharedCounter is useful to keep track of increments. While a key-value data structure appears like a good fit, two
  clients simultaneously setting the same key can cause issues. By contrast, clients can increase or decrease the
  SharedCounter value by a specified amount, but they can't set it to a specified value. It is optimistic.

## Consensus data structures

Consensus data structures have one or both of these characteristics:

- Only one client can perform a particular action on a particular data item, such as pull an item off of a queue.
- An action, such as changing a value, can occur only when all clients consent to it.

These DDSes are **not** optimistic. Before a change to a consensus data structure is confirmed, the connected clients
must acknowledge the change.

- [TaskManager]({{< relref "task-manager.md" >}}) -- Tracks queues of clients that want to exclusively run a task.

### Consensus scenarios

Typical scenarios require the connected clients to "agree" on some course of action.

- Import data from an external source. (Multiple clients doing this could lead to duplicate data.)
- Upgrade a data schema. (All clients agree to simultaneously make the change.)

## Experimental data structures

{{< callout "note" "Experimental" "🧪" >}}

This page is about **EXPERIMENTAL** work.

We think it's close to being ready, so we wanted to show it to you early, but the API surface will likely break!

{{< /callout >}}

### Property DDS

[PropertyDDS](https://github.com/microsoft/FluidFramework/tree/main/experimental/PropertyDDS) represents the managed
data in a typed, hierarchical data model called a *PropertySet*. This model has many similarities to JSON, but is a
richer model, which adds more fine-grained types, additional collection types, references, and gives the ability to use
schemas to describe the structure of properties.

A PropertySet is a tree structured data model in which every node of the tree is a property. More documentation on this
DDS will be available over time.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[FluidContainer]: {{< relref "fluidcontainer.md" >}}
[IFluidContainer]: {{< relref "ifluidcontainer.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
