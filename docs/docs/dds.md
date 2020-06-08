# Introducing distributed data structures

Much of Fluid's power lies in a set of base primitives called distributed data structures. These data structures, such
as [SharedMap](./SharedMap.md) and the various types in the @fluidframework/sequence package, are eventually consistent.
The Fluid runtime manages these data structures; as changes are made locally and remotely, they are merged in seamlessly
by the runtime.

When you're working with a DDS, you can largely treat it as a local object. You can make changes to it as needed.
However, this local object can be changed not only by your local code, but also by the Fluid runtime. The Fluid runtime
is responsible for inbounding changes from the server and then replaying those changes locally. This means your code
should be structured to react to changes to the DDS instances and update accordingly.

As you make changes to the local DDS instance, the changes are sent to the Fluid server. Other clients are notified of
the change -- or they can query the server for changes -- and then merge the changes in locally. All of this is managed
by the Fluid runtime.

The quality of eventual consistency improves performance because local changes can be made optimistically, knowing that
the runtime will merge the change in the appropriate way eventually. This is a guarantee made by the Fluid runtime.
Thus, you need not check for changes prior to 'committing' local changes. If there are changes on the server, they will
be retrieved and merged in seamlessly, and events will be emitted by the data structures, allowing your code to react to
the changes if needed. And this all happens _very_ quickly.

There are cases, however, where the eventually consistent guarantee is insufficient. In these cases, the consensus data
structures are useful. These types of data structures defer applying operations until they're acknowledged by the
server. This ensures that each client `.pop`s a different value from a stack, for example.

## Picking the right data structure

### Merge behavior

## Map-like data structures

## Sequence-like data structures

## Consensus-based data structures

## Quorum data structure

