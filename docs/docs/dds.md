# Introducing distributed data structures

<!-- The Fluid Framework is, at its most fundamental, a system to manage and synchronize distributed data. Fluid's approach
to data is different than other data frameworks you may have used in the past, because it embraces distributed computing
paradigms and provides a _single_

## What's different about Fluid?

Consider a collaborative solution built in a web browser that uses a relational database as a data store. In such a
solution, when a user loads the application, database queries are issued to pull data from the database and transform it
into a form that can be used in the browser client side code.

When users edit data,  -->

The primary way that developers interact with the Fluid Framework is through a collection of objects called _distributed
data structures_. We call them this because they are similar to data structures used commonly when programming, like
strings, maps/dictionaries, and sequences/lists. The APIs provided by distributed data structures are designed to be
familiar to programmers who've used these types of data structures before. For example, the `SharedMap` DDS is used to
store key/value pairs, just like a typical map or dictionary data structure, and provides `get` and `set` methods to
store and retrieve data in the map.

When using a DDS, you can largely treat it as a local object. You can add data to it, remove data, update it, etc.
However, a DDS is not _just_ a local object. Fluid's purpose is to make it easier to build systems with _distributed_
data, where multiple users are editing the same data source. A DDS can be changed not only by your code running locally
on the client, but also by the Fluid runtime on behalf of other users that are editing.

::: tip

The names of distributed data structures are prefixed with `Shared` by convention. SharedMap, SharedInk, SharedString,
etc. This prefix indicates that the object is shared between multiple clients.

:::

When a DDS is changed by the Fluid runtime, it raises an [event](#events). You can listen to these events so that you
know when data is changed by remote clients and can react appropriately. For example, you may need to recalculate a
derived value when some data in a DDS changes.

Most distributed data structures are _eventually consistent_. This means that, assuming no new changes to the data
structures, all of the distributed copies of the DDS will reach an identical state in a finite amount of time.

The quality of eventual consistency improves performance because local changes can be made optimistically, knowing that
the runtime will merge the change in the appropriate way eventually. This is a guarantee made by the Fluid runtime.
Thus, you need not check for changes prior to 'committing' local changes. If there are changes on the server, they will
be retrieved and merged in seamlessly, and events will be emitted by the data structures, allowing your code to react to
the changes if needed. And this all happens _very_ quickly.

There are cases, however, where the eventually consistent guarantee is insufficient. In these cases, the consensus-based
distributed data structures are useful. These data structures defer applying operations until they're acknowledged by
the server. This can be used to ensures that each client pops a different value from a distributed stack, for example.

## Merge behavior

In a distributed system like Fluid, it is critical to understand how to merge changes from multiple clients because it
enables you to "preserve user intent" when users are collaborating on data. This means that the merge behavior should
match what users intend or expect as they are editing data.

In Fluid, the merge behavior is defined by the DDS. The simplest merge strategy, employed by key-value distributed data
structures like SharedMap, is "Last Writer Wins" (LWW). With this merge strategy, when multiple clients write different
values to the same key, the value that was written last will overwrite the others. Refer to the sections below for more
details about the merge strategy used by each DDS.


## Creating and storing distributed data structures



### Storing a DDS within another DDS

## Events

## Picking the right data structure

### Granularity of collaboration

::: danger TODO

This is important because it influences the data model.

:::

## Key-value data

### SharedMap

### SharedDirectory

### SharedCell

## Sequences

### SharedNumberSequence

### SharedObjectSequence

### SharedString

## Specialized data structures

### SharedMatrix

### Quorum

## Consensus-based data structures


!!!include(links.md)!!!
