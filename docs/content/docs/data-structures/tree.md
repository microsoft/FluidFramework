---
title: SharedTree
menuPosition: 6
---

## Introduction

The `SharedTree` distributed data structure (DDS), available in Fluid Framework 2.0 preview and later, is used to store most or all of your application's shared data in a hierarchical structure. 

A `SharedTree` object has the following characteristics:

- It has a root and can have several types of branch nodes and several types of leaf nodes.
- Although there are some exceptions, for the most part, each type of node closely mirrors a familiar JavaScript datatype, such as object, map, array, boolean, number, string, and null. 
- Again, with exceptions, your code accesses nodes with the syntax of JavaScript and TypeScript, such as dot notation, property assignment, and array indexes. 
- Besides being of the type `SharedTree`, the object must also conform to a schema that your code creates so it has an application-specific strong typing too.
- The various types of branch nodes can be nested in one another (subject to the constraints of the schema).

### Node types

The following leaf node types are available:

- **boolean**: Works identically to a JavaScript boolean.
- **number**: Works identically to a JavaScript JavaScript number.
- **string**: Works identically to a JavaScript string.
- **null**: Works identically to a JavaScript null. 
- **FluidHandle**: A handle to a Fluid DDS or Data Object in the current container. For more information about handles see [Handles]({{< relref "handles.md" >}}).

The following subsections describe the available branch node types.

#### Object nodes

An object node it a TypeScript-like object with one or more named child properties. The object node's properties can in principle be any of the node types including branch node types; but typically the schema for the `SharedTree` that your code defines will specify for any object node a specific set of properties and node types of each. A `SharedTree` can have many object nodes at various places in the tree and they do not all have to conform to the same schema. Your schema can specify different properties for different object nodes. The schema also specifies whether a child property is required or optional, and it can assign a union datatype to any property. For example, a property could be either number or string.

For information about creating the schema for an object node, see [Object schema](#object-schema). For information about adding an object node to the the `SharedTree` and about reading and writing to an object node, see [Object node APIs](#object-node-apis).

#### Map nodes

A map node is a set of zero or more key-value pairs similar to a JavaScript Map object, but the keys can only be strings. The schema for the `SharedTree` that your code defines will specify the possible node types that can be values of the keys. It can specify that all node types are allowed or only a subset. There is no way to specify different subsets of node types for different keys. 

The schema for a map node cannot specify particular key names, nor can it specify a maximum or minimum number of key-value pairs.

For information about creating the schema for a map node, see [Map schema](#map-schema). For information about adding a map node to the the `SharedTree` and about reading and writing to a map node, see [Map node APIs](#map-node-apis).

#### List nodes

A list node is an indexed sequence of zero or more values like a JavaScript array. In principle, values can be any of the node types, but the schema that your code defines will specify what subset of those types can be the values of any given list item.

For information about creating the schema for a list node, see [List schema](#list-schema). For information about adding a list node to the the `SharedTree` and about reading and writing to a list node, see [List node APIs](#list-node-apis).

## Installation

The `SharedTree` library can be found in the [fluid-experimental/tree2](https://www.npmjs.com/package/@fluid-experimental/tree2) package.

To get started, run the following from a terminal in your repository:

```bash
npm install @fluid-experimental/tree2
```

## Usage

The major programming tasks for using `SharedTree`s are:

- Define a schema for the `SharedTree`. As you build out from prototype to full production application, you can add to this schema and create additional schemas for additional `ShareTree`s. See [Schema definition](#schema-definition).
- Create the `SharedTree` object. See [Creation](#creation).
- Create code that reads and writes to the nodes of the `SharedTree`. See [API](#api).

### Schema definition

Start by creating a `SchemaBuilder` object. The following is an example. Note that the `scope` property must be some unique string such as a UUID.

```typescript
import { ... SchemaBuilder, ... } from '@fluid-experimental/tree2';

const sb = new SchemaBuilder({ scope: 'ec1db2e8-0a00-11ee-be56-0242ac120002' });
```

The `SchemaBuilder` class defines five primitive data types; `boolean`, `string`, `number`, `null`, and `handle` for specifying leaf nodes. It also has three methods for specifying branch nodes; `object()`, `list()`, and `map()`. Use the members of the class to build a schema. 

As an example, consider an app that provides a digital board with groups of sticky notes as shown in the following screenshot: 

![A screenshot of a sticky note board app](/images/sticky-note-board-app.png)

The full sample is at: ------------------ LINK TO SAMPLE ------------------. *The code snippets in this article are simplified versions of the code in the sample.*

#### Object schema

Use the `object()` method to create a schema for a note. Note the following about this code:

- The `object()`, `list()`, and `map()` methods return an object that defines a schema. Notionally, you can think of this object as datatype. (And there is a way, described later in this article, to convert it into an actual TypeScript type.)
- The first parameter of `object()` is the name of the type.
- The `id`, `text`, and `author` properties are leaf nodes.
- The `votes` property is a list node, whose members are all strings. It is defined with an inline call of the `list()` method.

```typescript
const noteSchema = sb.object('note', {
    id: sb.string,
    text: sb.string,
    author: sb.string,
    votes: sb.list(sb.string),      
});
```

Create the schema for a group of notes. 

```typescript
const groupSchema = sb.object('group', {
    id: sb.string,
    name: sb.string,
    notes: sb.list(noteSchema),
});
```

#### List schema

The app is going to need the type that is returned from `sb.list(noteSchema)` in multiple places, so it can be assigned to a const and the `groupSchema` redefined to use the const as follows:

```typescript
const notesListSchema = sb.list(noteSchema);

const groupSchema = sb.object('group', {
    id: sb.string,
    name: sb.string,
    notes: notesListSchema,
});
```

#### Root schema

As you can see from the screenshot, the top level of the root of the app's data can have two kinds of children: notes in groups and notes that are outside of any group. So, the children are defined as a list with two types of items. This is done by passing an array of schema types to the `list()` method.

```typescript
const itemsSchema = sb.list([groupSchema, noteSchema]);

const rootSchema = sb.object('root', {
    items: itemsSchema,
});
```

The next step is to create the complete schema with a call of the `SchemaBuilder.intoSchema()` method. 

```typescript
const appSchema = sb.intoSchema(rootSchema);
```

The final step is to create a configuration object that will be used when a `SharedTree` object is created. See [Creation](#creation). The following is an example of doing this. Note that the `initialTree` property specifies the initial value of the tree. The value assigned to it must conform to the root schema, so in this example, it has a single `items` property. The value of the `items` property specifies that the items list is empty. It is not a requirement that the initial tree be empty: you can assign one or more groups or notes to the initial tree. 

```typescript
export const appSchemaConfig = {
    schema: appSchema,
    initialTree: {
        items: {"":[]},
    },
};
```

#### Map schema

The sticky notes example doesn't have any map branches, but creating a map schema is like creating a list schema, except that you use the `map()` method. Consider a silent auction app. Users view various items up for auction and place bids for items they want. One way to represent the bids for an item is with a map from user names to bids. The following snippet shows how to create the schema. Note that `map()` doesn't need a parameter to specify the type of keys because it is always string. 

```typescript
const auctionItemSchema = sb.map(sb.number);
```

Like `list()`, `map()` can accept an array of types when the values of the map are not all the same type. 

```typescript
const myMapSchema = sb.map([sb.number, sb.string]);
```

#### Setting properties as optional

To specify that a property is not required, pass it to the `SchemaBuilder.optional()` method inline. The following example shows a schema with two optional properties.

```typescript
const proposalSchema = sb.object('proposal', {
    id: sb.string,
    text: sb.optional(sb.string), 
    comments: sb.optional(sb.list(commentSchema)),   
});
```

#### Turning schema types into actual types

As mentioned above, you can think of the objects returned by the `object()`, `map()`, and `list()` methods as types. But this is true only in code within the context of the `SchemaBuilder` object. There are scenarios in which it would be helpful to have actual TypeScript types that match your schema types in other parts of the app. For example, if your app has a React UI and a `<Group>` component for displaying a group of notes, it would be convenient to define the component's properties with a type just like the `groupSchema`. Fluid Framework provides a generic type called `ProxyNode<T>` that can be used, in conjunction with the `type` and `typeof` keywords, to define a TypeScript datatype that duplicates a schema type. The following is an example:

```typescript
import { ... ProxyNode, ... } from '@fluid-experimental/tree2';

export type Group = ProxyNode<typeof groupSchema>;
```

### Creation

To create a `SharedTree` object, create a container with an initial object of that type and then apply the schema to it. The code in this section continues the sticky note example. Start by creating a container schema with an initial object of type `SharedTree` and use it to create a container.

```typescript
const containerSchema: ContainerSchema = {
    initialObjects: {
        appData: ISharedTree,
    },
};

const { container, services } = await client.createContainer(containerSchema);
```

Apply the schema to the tree by passing the schema configuration object to the `ISharedTree.schematize()` method.

```typescript
const stickyNotesTree = container.initialObjects.appData as ISharedTree;

stickyNotesTree.schematize(appSchemaConfig);
```

You can now add child items to the `stickyNotesTree` object using the methods described in [API](#api) below.

### API

The `SharedTree` object provides methods that enable your code to add nodes to the tree, remove nodes, and move nodes within the tree. You can also set and read the values of leaf nodes. The APIs have been designed to match as much as possible the syntax of TypeScript primitives, objects, maps, and arrays; although it is not possible to match exactly. 

#### Leaf node APIs

Leaf nodes are read and written exactly the way JavaScript primitive types are by using dot notation and the assignment operator (`=`). The following example shows how to write to a leaf node:

```typescript
myNewsPaperTree.articles[1].headline = "Man bites dog";
```

The following examples show how to read from a leaf node. *Note that the datatype of `pointsForDetroitTigers` is `number`, not `sb.number`. *This is a general principle: the value returned from a leaf node, other than a `FluidHandle` node, is the underlying JavaScript primitive type.

```typescript
const pointsForDetroitTigers: number = seasonTree.tigersTeam.game1.points;
```

#### Object node APIs

Your code reads object nodes and their properties exactly as it would read a JavaScript object. The following are some examples.

```typescript
const pointsForDetroitTigers: number = seasonTree.tigersTeam.game1.points;

const counterHandle: FluidHandle = myTree.myObjectNode.myHandle; 

const myItems: List = stickyNotesTree.items;
```

To write to an object node, you first create an object and then assign it to the node with the assignment operator (`=`). If the object node is a child of a map or list node, use the write [Map node write APIs](#map-node-write-apis) or [List node write APIs](#list-node-write-apis). 

You must create the object using `create()` method of schema object. The following shows how to create a note object from the sticky notes example.

```typescript
const babyShowerNote = noteSchema.create({ 
    id: Guid.create().toString(), 
    text: “Baby shower is at 3 PM today.”, 
    author: "Bob",
    votes: ["0"]
});
```

We show how to add this note to a list of notes in the tree in [List node APIs](#list-node-apis).

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

Returns an array, not a map node or list node, that is a result of applying the callback parameter to each member of the original map node. It is just like [Array.map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map). 

##### Map node write APIs

The write methods for map nodes are also the same as the corresponding methods for JavaScript Map objects.

```typescript
set(key: string, value: T) 
```

The `set()` method sets/changes the value of the item with the specified key. If the key is not present, the item is added to the map. Note the following:

- The `T` can be any type that conforms to the map node's schema. For example, if the schema was defined with `const myMapSchema = sb.map([sb.number, sb.string]);`, then `T` could be `number` or `string`.
- If multiple clients set the same key simultaneously, the key gets the value set by the last edit to apply. For the meaning of "simultaneously", see [Types of distributed data structures]({{< relref "overview.md" >}}). 

```typescript
delete(key: string): boolean 
```

The `delete()` method removes the item with the specified key. If the key is not present, the method returns `false`. If one client sets a key and another deletes it simultaneously, the key is deleted only if the deletion op is the last one applied. For the meaning of "simultaneously", see [Types of distributed data structures]({{< relref "overview.md" >}}). 

##### Map node properties

```typescript
size: number 
```

The total number of entries in the map node.

#### List node APIs

##### List node read APIs

List nodes have all the same non-mutating read methods as the JavaScript [Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) type. (For information about the differences between mutating and non-mutating methods, see [Copying methods and mutating methods](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array#copying_methods_and_mutating_methods)). Note that methods which return an array, like `Array.map()`, return a JavaScript array, not a List, when called on a list node.

##### List node write APIs

The write APIs for list nodes are quite different from JavaScript arrays. There are three categories of write APIs: Insert, Remove, and Move.

###### Insert methods

List nodes have three methods that insert new items into the node. Note that in all of the following, the `T` can be any type that conforms to the list node's schema. For example, if the schema was defined with `const myListSchema = sb.list([sb.number, sb.string]);`, then `T` could be `number` or `string`.

```typescript
insertAt(index: number, value: Iterable<T>) 
```

Inserts the provided value(s) at the specified `index`. If the `index` is greater than the length of the list, the items are inserted at the end of the list. 

```typescript
insertAtStart(value: Iterable<T>) 
```

Inserts the provided value(s) at the start of the list. This is sugar for `insertAt(0, …)`. 

```typescript
insertAtEnd(value: Iterable<T>) 
```

Inserts the provided value(s) at the end of the list. This is syntactic sugar for `insertAt(Infinity, …)`. 

###### Remove methods

List nodes have two methods that remove items from the node. Note the following about these methods:

- Removed items are saved internally for a time in case they need to be restored as a result of an undo operation. 
- A removed item may be restored as a result of a simultaneous move operation from another client. For example, if one client removes items 3-5, and another client simultaneously moves items 4 and 5, then only item 3 is removed. The other two are moved, regardless of the order of the move and remove operations. 
- Removal of items never overrides inserting items. For example, , if one client removes items 10-15, and another client simultaneously inserts an item at index 12, the original items 10-15 are removed, but new item is inserted between item 9 and the item that used to be at index 16. This happens regardless of the order of the remove and insert operations.

For the meaning of "simultaneously", see [Types of distributed data structures]({{< relref "overview.md" >}}). 

```typescript
removeAt(index: number) 
```

Removes the item at the given `index.`` 

```typescript
removeRange(start?: number, end?: number) 
```

Removes the items indicated by the `start` index (inclusive) and `end` index (exclusive). If the end index is omitted, every item from the start index to the end is removed. If the start index is omitted, it defaults to 0. So, calling `removeRange()` removes all the items in the list. 

###### Move methods

List nodes have three methods that move items within a list or from one list node to another. When moving from one list node to another, these methods must be called from the destination list node.

```typescript
moveToStart(sourceStartIndex: number, sourceEndIndex: number, source?: List<T>) 
```

Moves the specified items to the start of the list. Specify a `source` list if it is different from the destination list.

```typescript
moveToEnd(sourceStartIndex: number, sourceEndIndex: number, source?: List<T>) 
```

Moves the specified items to the end of the list. Specify a `source` list if it is different from the destination list.

```typescript
moveToIndex(index: number, sourceStartIndex: number, sourceEndIndex: number, source?: List<T>) 
```

Moves the items to the specified `index` in the destination list. The item that is at `index` before the method is called will be at the first index position that follows the moved items after the move. Specify a `source` list if it is different from the destination list. If the items are being moved within the same list, the `index` position is calculated including the items being moved. 

### Events

The `SharedTree` object supports two events: `beforeChange` and `afterChange`. Your code can create handlers for these events using the utility class `Tree`. See [Tree utility APIs](#tree-utility-apis).

## Tree utility APIs

The `Tree` class provides some static utility APIs for working with `ShareTree` objects.

## Events

```typescript
Tree.on(node: SharedTreeNode, eventType: string, listener: () => void) 
```

Assigns the specified `listener` function to the specified `event type` for the specified `node`. The `node` can be any node of the tree. The `[event type]` can be either "afterChange" or "beforeChange". An `event` object is automatically passed to the `listener`. It has three members:

- `event.target`: The node on which the event was triggered.
- `event.isLocal`: Specifies whether the change was made on the local client or a remote client.
- `event.stopPropagation()`: If called in the listener, it stops the event from being triggered on the parent, in the tree, of the `event.target`.

## Type guard

```typescript
Tree.is(someNode: SharedTreeNode, nodeType: TreeNodeSchema): boolean
```

Returns `true` if `someNode` is of type `nodeType`. Your code can call this when it has a reference to a node whose exact type isn't known. Here is an example:

```typescript
if (Tree.is(myNode, sb.number)) {
   // Code here that processes number nodes.
}
```

For another example, see the `Tree.parent()` method in [Node information](#node-information).

## Node information

```typescript
Tree.key(node: SharedTreeNode): number | string
```

Returns the key of the `node`. This is a string in all cases, except a list node, in which case it returns the index of the node.

```typescript
Tree.parent(node: SharedTreeNode)
```

Returns the parent node of `node`. The following snippet continues the sticky notes example. Suppose that you have a reference to a note object and you want to delete it if, and only if, it is a member of a list of notes in a group or it is a direct child of the root. You can get the parent node and test what it's type is using the `Tree.is()` method.

```typescript
const parent = Tree.parent(note);

if (Tree.is(parent, notes) || Tree.is(parent, items)) {
    const index = parent.indexOf(note);        
    parent.removeAt(index);        
}
```

```typescript
Tree.status(node: SharedTreeNode): TreeStatus
```

Returns the current status of `node`. Possible values are:

- **InDocument**: The node is in the tree.
- **Removed**: The node has been removed from the tree but is still restorable by undo.
- **Deleted**: The node is deleted and unrestorable.

```typescript
Tree.schema(node: SharedTreeNode): TreeNodeSchema
```

Returns the object that defines the schema of the `node` object. 

## API Documentation

For a comprehensive view of the `ShareTree` package's API documentation, see [the SharedTree API docs]({{< ref "docs/apis/tree.md" >}}).
