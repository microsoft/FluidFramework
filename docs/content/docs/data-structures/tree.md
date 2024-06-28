---
title: SharedTree
menuPosition: 6
---

## Introduction

The `SharedTree` distributed data structure (DDS), available in Fluid Framework 2 and later, is used to store most or all of your application's shared data in a hierarchical structure.

A `SharedTree` has the following characteristics:

-   It is accessed through a `TreeView` object that exposes all the functionality for reading and editing data within a `SharedTree`.
-   It has a root and can have several types of internal (i.e., non-leaf) nodes and several types of leaf nodes.
-   Although there are some exceptions, for the most part, each type of node closely mirrors a familiar JavaScript datatype, such as object, map, array, boolean, number, string, and null.
-   Again, with exceptions, your code accesses nodes with the syntax of JavaScript and TypeScript, such as dot notation, property assignment, and array indexes.
-   A `TreeView` will conform to a schema that your code creates so it has application-specific strong typing.
-   The various types of internal nodes can be nested (subject to the constraints of the schema).

### TreeView object

The `TreeView` object is accessed via the Fluid Framework `IFluidContainer` object (container). The `TreeView` contains a `root` node that provides access to the complete `SharedTree`. The `TreeView` also provides access to tree-level events.

### Node types

The following leaf node types are available:

-   **boolean**: Works identically to a JavaScript boolean.
-   **number**: Works identically to a JavaScript JavaScript number.
-   **string**: Works identically to a JavaScript string.
-   **null**: Works identically to a JavaScript null.
-   **FluidHandle**: A handle to a Fluid DDS or Data Object in the current container. For more information about handles see [Handles]({{< relref "handles.md" >}}).

The following subsections describe the available internal node types.

#### Object nodes

An object node is a TypeScript-like object with one or more named child properties. The object node's properties can in principle be any of the node types including internal node types; but typically the schema for the `SharedTree` that your code defines will specify for any object node a specific set of properties and node types of each. A `SharedTree` can have many object nodes at various places in the tree and they do not all have to conform to the same schema. Your schema can specify different properties for different object nodes. The schema also specifies whether a child property is required or optional, and it can assign a union datatype to any property. For example, a property could be either number or string.

For information about creating the schema for an object node, see [Object schema](#object-schema). For information about adding an object node to the the `SharedTree` and about reading and writing to an object node, see [Object node APIs](#object-node-apis).

#### Map nodes

A map node is a set of zero or more key-value pairs similar to a JavaScript Map object, but the keys can only be strings. The schema for the `SharedTree` that your code defines will specify the possible node types that can be values of the keys. It can specify that all node types are allowed or only a subset. There is no way to specify different subsets of node types for different keys.

The schema for a map node cannot specify particular key names, nor can it specify a maximum or minimum number of key-value pairs.

For information about creating the schema for a map node, see [Map schema](#map-schema). For information about adding a map node to the the `SharedTree` and about reading and writing to a map node, see [Map node APIs](#map-node-apis).

#### Array nodes

An array node is an indexed sequence of zero or more values like a JavaScript array. In principle, values can be any of the node types, but the schema that your code defines will specify what subset of those types can be the values of any given array item.

For information about creating the schema for an array node, see [Array schema](#array-schema). For information about adding an array node to the `SharedTree` and about reading and writing to an array node, see [Array node APIs](#array-node-apis).

## Installation

The `SharedTree` library can be found in the [fluid-framework](https://www.npmjs.com/package/fluid-framework) package (version 2.x).

To get started, run the following from a terminal in your project folder:

```bash
npm install fluid-framework@latest
```

## Usage

The major programming tasks for using `SharedTree`s are:

-   Define a schema for the `SharedTree`. As you build out from prototype to full production application, you can add to this schema and create additional schemas for additional `ShareTree`s. See [Schema definition](#schema-definition).
-   Initialize the `TreeView` object. See [Creation](#creation).
-   Create code that reads and edits the nodes of the `SharedTree`. See [API](#api).

### Schema definition

Start by creating a `SchemaFactory` object. The following is an example. Note that the parameter must be some unique string such as a UUID.

```typescript
import { ... SchemaFactory, ... } from 'fluid-framework';

const sf = new SchemaFactory('ec1db2e8-0a00-11ee-be56-0242ac120002');
```

The `SchemaFactory` class defines five primitive data types; `boolean`, `string`, `number`, `null`, and `handle` for specifying leaf nodes. It also has three methods for specifying internal nodes; `object()`, `array()`, and `map()`. Use the members of the class to build a schema.

As an example, consider an app that provides a digital board with groups of sticky notes as shown in the following screenshot:

![A screenshot of a sticky note board app](/images/sticky-note-board-app.png)

The full sample is at: [Shared Tree Demo](https://github.com/microsoft/FluidExamples/tree/main/brainstorm). *The code snippets in this article are simplified versions of the code in the sample.*

#### Object schema

Use the `object()` method to create a schema for a note. Note the following about this code:

-   The `object()`, `array()`, and `map()` methods return an object that defines a schema. Notionally, you can think of this object as datatype. (In the next step, you covert it to an actual TypeScript type.)
-   The first parameter of `object()` is the name of the type.
-   The `id`, `text`, `author`, and `lastChanged` properties are leaf nodes.
-   The `votes` property is an array node, whose members are all strings. It is defined with an inline call of the `array()` method.

```typescript
const noteSchema = sf.object('Note', {
    id: sf.string,
    text: sf.string,
    author: sf.string,
    lastChanged: sf.number,
    votes: sf.array(sf.string),
});
```

Create a TypeScript datatype by extending the notional type object.

```typescript
class Note extends noteSchema { /* members of the class defined here */ };
```

You can also make the call of the `object()` method inline as in the following:

```typescript
class Note extends sf.object('Note', {
    id: sf.string,
    text: sf.string,
    author: sf.string,
    lastChanged: sf.number,
    votes: sf.array(sf.string),
}) { /* members of the class defined here */  };
```

For the remainder of this article, we use the inline style.

You can add fields, properties, and methods like any TypeScript class including methods that wrap one or more methods in the `SharedTree` [APIs](#api). For example, the `Note` class can have the following `updateText` method. Since the method writes to shared properties, the changes are reflected on all clients.

```typescript
public updateText(text: string) {
    this.lastChanged = new Date().getTime();
    this.text = text;
}
```

You can also add members that affect only the current client; that is, they are not based on DDSes. For example, the sticky note application can be updated to let each user set their own color to any note without changing the color of the note on any other clients. To facilitate this feature, the following members could be added to the `Note` class. Since the `color` property is not a shared object, the changes made by `setColor` only affect the current client.

```typescript
private color: string = "yellow";

public setColor(newColor: string) {
    this.color = newColor;
}
```

{{< callout note >}}

Do *not* override the constructor of types that you derive from objects returned by the `object()`, `array()`, and `map()` methods of `SchemaFactory`. Doing so has unexpected effects and is not supported.

{{< /callout >}}

Create the schema for a group of notes. Note that the `array()` method is called inline, which means that the `Group.notes` property has the notional datatype of an array node. We'll change this to a genuine TypeScript type in the [Array schema](#array-schema) section.

```typescript
class Group extends sf.object('Group', {
    id: sf.string,
    name: sf.string,
    notes: sf.array(Note),
});
```

#### Array schema

The app is going to need the type that is returned from `sf.array(Note)` in multiple places, including outside the context of `SchemaFactory`, so we create a TypeScript type for it as follows. Note that we include a method for adding a new note to the array of notes. The implementation is omitted, but it would wrap the constructor for the `Note` class and one or more methods in the [Array node APIs](#array-node-apis).

```typescript
class Notes extends sf.array('Notes', Note) {
    public newNote(author: string) {
        // implementation omitted.
    }
}
```

Now revise the declaration of the `Group` class to use the new type.

```typescript
class Group extends sf.object('Group', {
    id: sf.string,
    name: sf.string,
    notes: Notes,
});
```

#### Root schema

As you can see from the screenshot, the top level of the root of the app's data can have two kinds of children: notes in groups and notes that are outside of any group. So, the children are defined as `Items` which is an array with two types of items. This is done by passing an array of schema types to the `array()` method. Methods for adding a new group to the app and a new note that is outside of any group are included.

```typescript
class Items extends sf.array('Items', [Group, Note]) {
    public newNote(author: string) {
        // implementation omitted.
    }

    public newGroup(name: string): Group {
        // implementation omitted.
    }
}
```

The root of the schema must itself have a type which is defined as follows:

```typescript
class App extends sf.object('App', {
    items: Items,
}) {}
```

The final step is to create a configuration object that will be used when a `SharedTree` object is created or loaded. See [Creation](#creation). The following is an example of doing this.

```typescript
export const appTreeConfiguration = new TreeViewConfiguration({
    // root node schema
    schema: App
});
```

#### Map schema

The sticky notes example doesn't have any map nodes, but creating a map schema is like creating an array schema, except that you use the `map()` method. Consider a silent auction app. Users view various items up for auction and place bids for items they want. One way to represent the bids for an item is with a map from user names to bids. The following snippet shows how to create the schema. Note that `map()` doesn't need a parameter to specify the type of keys because it is always string.

```typescript
class AuctionItem extends sf.map('AuctionItem', sf.number) { ... }
```

Like `array()`, `map()` can accept an array of types when the values of the map are not all the same type.

```typescript
class MyMapSchema extends sf.map('MyMap', [sf.number, sf.string]) { ... }
```

#### Recursive schema

Additionally, you can create recursive types (nodes that include nodes of the same type in their subtree hierarchy). Because of current limitation in TypeScript, doing this requires specific versions of the node types: `objectRecursive()`, `arrayRecursive()`, and `mapRecursive`.

Due to limitations of TypeScript, recursive schema may not produce type errors when declared incorrectly. Using `ValidateRecursiveSchema` helps ensure that mistakes made in the definition of a recursive schema will introduce a compile error.

```typescript
type _check = ValidateRecursiveSchema<typeof myRecursiveType>;
```

#### Setting properties as optional

To specify that a property is not required, pass it to the `SchemaFactory.optional()` method inline. The following example shows a schema with two optional properties.

```typescript
class Proposal = sf.object('Proposal', {
    id: sf.string,
    text: sf.optional(sf.string),
    comments: sf.optional(sf.array(Comment)),
});
```

### Creation

To create a `TreeView` object, create a container with an initial object of type `SharedTree` and then call `viewWith` with some schema. The code in this section continues the sticky note example. Start by creating a container schema with an initial object of type `SharedTree` and use it to create a container.

```typescript
const containerSchema: ContainerSchema = {
    initialObjects: {
        appData: SharedTree,
    },
};

const { container, services } = await client.createContainer(containerSchema, "2");
```

Use `ITree.viewWith` to create a `TreeView` based on your tree configuration.
Tree views provide schema-dependent APIs for viewing and editing tree data.

```typescript
const stickyNotesTreeView = container.initialObjects.appData.viewWith(appTreeConfiguration);
```

When the tree is first created, this schema along with some initial data can be applied to the tree using `TreeView.initialize`.
Note that the data used to initialize the tree must conform to the root schema, `App`. So in this example, it has a single `items` property. The value of the `items` property specifies that the items array is empty. It is not a requirement that the initial tree be empty: you can assign one or more groups or notes to the initial tree.

```typescript
// Both of the following options are equivalent ways to initialize the tree.
// See documentation about plain-old javascript objects (POJO) on `SchemaFactory` for more details.

// Option 1:
stickyNotesTreeView.initialize({ items: [] });

// Option 2:
stickyNotesTreeView.initialize(new App({ items: [] }));
```

You can now add child items to the `stickyNotesTreeView` object using the methods described in [API](#api) below.

### API

The `TreeView` object and its children provide methods that enable your code to add nodes to the tree, remove nodes, and move nodes within the tree. You can also set and read the values of leaf nodes. The APIs have been designed to match as much as possible the syntax of TypeScript primitives, objects, maps, and arrays; although some editing APIs are different for the sake of making the merge semantics clearer.

#### Leaf node APIs

Leaf nodes are read and written exactly the way JavaScript primitive types are by using dot notation and the assignment operator (`=`). The following example shows how to write to a leaf node:

```typescript
myNewsPaperTree.articles[1].headline = "Man bites dog";
```

The following examples show how to read from a leaf node. *Note that the datatype of `pointsForDetroitTigers` is `number`, not `sf.number`.* This is a general principle: the value returned from a leaf node, other than a `FluidHandle` node, is the underlying JavaScript primitive type.

```typescript
const pointsForDetroitTigers: number = seasonTree.tigersTeam.game1.points;
```

#### Object node APIs

##### Reading Object Properties

Your code reads object nodes and their properties exactly as it would read a JavaScript object. The following are some examples.

```typescript
const pointsForDetroitTigers: number = seasonTree.tigersTeam.game1.points;

const counterHandle: FluidHandle = myTree.myObjectNode.myHandle;

const myItems: Array = stickyNotesTree.items;
```

##### Creating Objects

You must create the object using the constructor of the class that you derived from the object returned by `SchemaFactory.object()` method. The following shows how to create a note object from the sticky notes example.

```typescript
const babyShowerNote = new Note({
    id: Guid.create().toString(),
    text: "Baby shower is at 3 PM today.",
    author: "Bob",
    lastChanged: 19697 // Days since January 1, 1970, the Unix epoch.
    votes: ["0"]
});
```

We show how to add this note to an array of notes in the tree in [Array node APIs](#array-node-apis).

##### Editing Object Properties

To update the property on an object node, you assign a new node or value to it with the assignment operator (`=`).

```typescript
rectangle.topLeft = new Point({ x: 0, y: 0 });
```

```typescript
babyShowerNote.author = "The Joneses";
```

Optional properties can be cleared by assigning `undefined` to them.

```typescript
proposal.text = undefined;
```

#### Map node APIs

##### Map node read APIs

The read APIs for map nodes have the same names and syntax as the corresponding APIs for JavaScript Map objects.

```typescript
has(key): boolean
```

Returns `true`` if the key is present in the map.

```typescript
get(key): T | undefined
```

Returns the value of the property with the specified key.

```typescript
keys(): IterableIterator<string>
```

Returns an Iterator that contains the keys in the map node. The keys are iterated in the order that they were added.

```typescript
values(): IterableIterator<T>
```

Returns an Iterator that contains the values in the map node. The values are iterated in the order that they were added.

```typescript
entries(): IterableIterator<[string, T]>
```

Returns an Iterator that contains the key/value pairs in the map node. The pairs are iterated in the order that they were added.

```typescript
map(callback: ()=>[]): IterableIterator<[string, T]>
```

Returns an array, *not a map node or array node*, that is the result of applying the callback parameter to each member of the original map node. It is just like [Array.map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map).

##### Map node write APIs

The write methods for map nodes are also the same as the corresponding methods for JavaScript `Map` objects.

```typescript
set(key: string, value: T)
```

The `set()` method sets/changes the value of the item with the specified key. If the key is not present, the item is added to the map. Note the following:

-   The `T` can be any type that conforms to the map node's schema. For example, if the schema was defined with `class MyMap extends sf.map([sf.number, sf.string]);`, then `T` could be `number` or `string`.
-   If multiple clients set the same key simultaneously, the key gets the value set by the last edit to apply. For the meaning of "simultaneously", see [Types of distributed data structures]({{< relref "overview.md" >}}).

```typescript
delete(key: string): void
```

The `delete()` method removes the item with the specified key. If one client sets a key and another deletes it simultaneously, the key is deleted only if the deletion op is the last one applied. For the meaning of "simultaneously", see [Types of distributed data structures]({{< relref "overview.md" >}}).

##### Map node properties

```typescript
size: number
```

The total number of entries in the map node.

#### Array node APIs

##### Array node read APIs

Array nodes have all the same non-mutating read methods as the JavaScript [Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) type. (For information about the differences between mutating and non-mutating methods, see [Copying methods and mutating methods](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array#copying_methods_and_mutating_methods)). Note that methods which return an array, like `Array.map()`, when called on an array node, return a JavaScript array, not an object of the type of the array node. For example, if the type is `Notes` from the sticky notes example, an array is returned, not a `Notes` object.

##### Array node write APIs

The write APIs for array nodes are quite different from JavaScript arrays. They are more suitable for data items that are being worked on collaboratively by multiple people. There are three categories of write APIs: Insert, Remove, and Move.

###### Insert methods

Array nodes have three methods that insert new items into the node. Note that in all of the following, the `T` can be any type that conforms to the array node's schema. For example, if the schema was defined with `class MyArray extends sf.array([sf.number, sf.string]);`, then `T` could be `number` or `string`.

```typescript
insertAt(index: number, value: Iterable<T>)
```

Inserts the provided value(s) at the specified `index`. If the `index` is greater than the length of the array, the items are inserted at the end of the array.

```typescript
insertAtStart(value: Iterable<T>)
```

Inserts the provided value(s) at the start of the array. This is sugar for `insertAt(0, …)`.

```typescript
insertAtEnd(value: Iterable<T>)
```

Inserts the provided value(s) at the end of the array. This is syntactic sugar for `insertAt(Infinity, …)`.

###### Remove methods

Array nodes have two methods that remove items from the node. Note the following about these methods:

-   Removed items are saved internally for a time in case they need to be restored as a result of an undo operation.
-   A removed item may be restored as a result of a simultaneous move operation from another client. For example, if one client removes items 3-5, and another client simultaneously moves items 4 and 5, then, if the move operation is ordered last, only item 3 is removed (items 4 and 5 are restored and moved to their destination by the move operation). If the remove operation is ordered last, then all three items will be removed, no matter where they reside.
-   Removal of items never overrides inserting (or moving in) items. For example, if one client removes items 10-15, and another client simultaneously inserts an item at index 12, the original items 10-15 are removed, but new item is inserted between item 9 and the item that used to be at index 16. This is true regardless of the order of the remove and insert operations.

For the meaning of "simultaneously", see [Types of distributed data structures]({{< relref "overview.md" >}}).

```typescript
removeAt(index: number)
```

Removes the item at the given `index`.

```typescript
removeRange(start?: number, end?: number)
```

Removes the items indicated by the `start` index (inclusive) and `end` index (exclusive). If the end index is omitted, every item from the start index to the end of the array is removed. If the start index is omitted, it defaults to 0. So, calling `removeRange()` removes all the items in the array.

###### Move methods

Array nodes have three methods that move items within an array or from one array node to another. When moving from one array node to another, these methods must be called from the destination array node. Note that in all of the following, the `T` can be any type that is derived from an object that is returned by a call of `SchemaFactory.array()`, such as the `Notes` and `Items` classes in the sticky notes example.

```typescript
moveToStart(sourceStartIndex: number, sourceEndIndex: number, source?: T)
```

Moves the specified items to the start of the array. Specify a `source` array if it is different from the destination array.

```typescript
moveToEnd(sourceStartIndex: number, sourceEndIndex: number, source?: T)
```

Moves the specified items to the end of the array. Specify a `source` array if it is different from the destination array.

```typescript
moveToIndex(index: number, sourceStartIndex: number, sourceEndIndex: number, source?: T)
```

Moves the items to the specified `index` in the destination array. The item that is at `index` before the method is called will be at the first index position that follows the moved items after the move. Specify a `source` array if it is different from the destination array. If the items are being moved within the same array, the `index` position is calculated including the items being moved (as if a new copy of the moved items were being inserted, without removing the originals).

Note the following about these methods:

-   If multiple clients simultaneously move an item, then that item will be moved to the destination indicated by the move of the client whose edit is ordered last.
-   A moved item may be removed as a result of a simultaneous remove operation from another client. For example, if one client moves items 3-5, and another client simultaneously removes items 4 and 5, then, if the remove operation is ordered last, items 4 and 5 are removed from their destination by the remove operation. If the move operation is ordered last, then all three items will be moved to the destination.

For the meaning of "simultaneously", see [Types of distributed data structures]({{< relref "overview.md" >}}).

### Events

`SharedTree` supports two node level events: `nodeChanged` and `treeChanged`. Your code can create handlers for these events using the utility class `Tree`. See [Tree utility APIs](#tree-utility-apis).

Additionally, the `TreeView` object includes 2 events that operate over the whole tree. These are `rootChanged` and `commitApplied`.

`rootChanged` fires when the root field (the field that contains the root node) changes. That is, if a new root node is assigned or the schema changes. This will not fire when the node itself changes.

`commitApplied` fires whenever a local change is applied outside of a transaction or when a local transaction is committed. This is used to get `Revertible` objects to put on the undo or redo stacks. See [Undo/Redo support](#undoredo-support) and [Transactions](#transactions).

### Undo/Redo support

`SharedTree` makes creating an undo and redo stack very simple. By listening for the `commitApplied` event on the `TreeView` object, you can get a `Revertible` object from a `Commit`.
`Commit` objects come in three flavors:

-   Default: a normal commit made in the local client that would go on the undo stack
-   Undo: a commit that is the result of reverting a Default or Redo `Revertible` object that would go on the redo stack
-   Redo: a commit that is the result of reverting an Undo `Revertible` object that would go on the undo stack

To undo a change, call the `revert` method on the `Revertible` object. This will return the properties of the `TreeView` object last changed by the local client to the their previous state. If changes were made to those properties by other clients in the meantime these changes will be overwritten. For example, if the local client moves 3 items into an array, and then a remote client moves one of those items somewhere else, when the local client reverts their change, the item moved by the remote client will be returned to its original position.

There is an example of a working undo/redo stack here: [Shared Tree Demo](https://github.com/microsoft/FluidExamples/tree/main/brainstorm).

## Tree utility APIs

The `Tree` class provides some static utility APIs for working with data in the `TreeView` object.

### Event handling

```typescript
on<K extends keyof TreeChangeEvents>(
		node: TreeNode,
		eventName: K,
		listener: TreeChangeEvents[K],
	): () => void;
```


`Tree.on` assigns the specified `listener` function to the specified `eventName` for the specified `node`.
The `node` can be any node of the tree.
The `eventName` can be either "treeChanged" or "nodeChanged".
`nodeChanged` fires whenever one or more properties of the specified node change.
`treeChanged` fires whenever one or more properties of the specified node or any node in its subtree, change.
We recommend looking at the documentation of each of the events for more details.

The `Tree.on()` method returns a function that unsubscribes the handler from the event. This method is typically called in clean up code when the node is being removed. For example:

```typescript
const unsubscribe = Tree.on(myTreeNode, "nodeChanged", () => {...});

// Later at some point when the event subscription is not needed anymore
unsubscribe();

```

### Type guard

When your code needs to process nodes only of a certain type and it has a reference to an object of an unknown type, you can use the `Tree.is()` method to test for the desired type as in the following examples.

```typescript
Tree.is(someNode: SharedTreeNode, nodeType: TreeNodeSchema | T): boolean
```

Returns `true` if `someNode` is of type `nodeType`. Note that `T` is a type that is derived from a call of one of the `SchemaFactory` methods; `object()`, `map()`, or `array()`. Here are examples:

```typescript
if (Tree.is(myNode, Note)) {
   // Code here that processes Note nodes.
}
```

For another example, see the `Tree.parent()` method in [Node information](#node-information).

### Transactions

If you want the `SharedTree` to treat a set of changes atomically, wrap these changes in a transaction. Using a transaction guarantees that (if applied) all of the changes will be applied together synchronously (though, note that the Fluid Framework guarantees this already for any sequence of changes that are submitted synchronously). However, the changes may not be applied at all if the transaction is given one or more constraints. If any constraint on a transaction is not met, then the transaction and all its changes will ignored by all clients. Additionally, all changes in a transaction will be reverted together as a single unit by [undo/redo code](#undoredo-support), because changes within a transaction are exposed through a single `Revertible` object. It is also more efficient for SharedTree to process a large number of changes in a row as a transaction rather than as changes submitted separately.

To create a transaction use the `Tree.runTransaction()` method. You can cancel a transaction from within the callback function by returning the special "rollback object", available via `Tree.runTransaction.rollback`. Also, if an error occurs within the callback, the transaction will be canceled automatically before propagating the error.

In this example, myNode can be any node in the SharedTree. It will be optionally passed into the callback function.

```typescript
Tree.runTransaction(myNode, (node) => {
    // Make multiple changes to the tree.
    // This can be changes to the referenced node but is not limited to that scope.
    if (
        // Something is wrong here!
    ) return "rollback";
})
```

You can also pass a `TreeView` object to `runTransaction()`.

```typescript
Tree.runTransaction(myTreeView, (treeView) => {
    // Make multiple changes to the tree.
})
```

There are example transactions here: [Shared Tree Demo](https://github.com/microsoft/FluidExamples/tree/main/brainstorm).


### Node information

```typescript
Tree.key(node: SharedTreeNode): number | string
```

Returns the key of the `node`. This is a string in all cases, except an array node, in which case it returns the index of the node.

```typescript
Tree.parent(node: SharedTreeNode): SharedTreeNode
```

Returns the parent node of `node`. The following snippet continues the sticky notes example. Suppose that you have a reference to a note object and you want to delete it if, and only if, it is a member of an array of notes in a group or it is a direct child of the root. You can get the parent node and test what its type is.

```typescript
const parent = Tree.parent(note);

if (Tree.is(parent, Notes) || Tree.is(parent, Items)) {
    const index = parent.indexOf(note);
    parent.removeAt(index);
}
```

```typescript
Tree.status(node: SharedTreeNode): TreeStatus
```

Returns the current status of `node`. Possible values are:

-   **InDocument**: The node is in the tree.
-   **Removed**: The node has been removed from the tree but is still restorable by undo.
-   **Deleted**: The node is deleted and unrestorable.

```typescript
Tree.schema(node: SharedTreeNode): TreeNodeSchema
```

Returns the object that defines the schema of the `node` object.

## API Documentation

For a comprehensive view of the `SharedTree` package's API documentation, see [the SharedTree API docs]({{< packageref "tree" >}}).
