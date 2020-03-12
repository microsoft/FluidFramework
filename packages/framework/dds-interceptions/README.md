# DDS Interceptions

This package provides factory methods to create a wrapper around some of the basic Distributed Data Structures (DDS) that support an interception callback. Apps can provide a callback when creating these wrappers and this callback will be called when the DDS is modified. This allows apps to support features such as basic user attibution on a SharedString.

## Shared String With Interception

It provides `createSharedStringWithInterception` that accepts a SharedString, the component context and a callback, and returns a SharedString object:
```typescript
function createSharedStringWithInterception(
    sharedString: SharedString,
    context: IComponentContext,
    propertyInterceptionCallback: (props?: MergeTree.PropertySet) => MergeTree.PropertySet): SharedString;
```

When a function is called that modifies the SharedString (for example, insertText), it calls the propertyInterceptionCallback function with the provided properties. The callback funtion can then provide the new set of properties that it wants to set. The operation in the called function and any operations in the callback function are batched, i.e., they are guaranteed to in order and will be applied together.

Example: To support a feature like simple user attribution, the app can append the user information to the properties in the callback. The user information can than be retrieved by getting the properties at any position.

## Shared Map With Interception

It provides `createSharedMapWithInterception` that accepts a SharedMap, the component context and a callback, and returns a SharedMap object:
```typescript
function createSharedMapWithInterception(
    sharedMap: SharedMap,
    context: IComponentContext,
    interceptionCallback: (key: string) => void): SharedMap;
```

When set is called on the SharedMap, it calls the interceptionCallback function with the given key. The callback funtion can perform any operation on the key. The original set operation and any operations in the callback function are batched, i.e., they are guaranteed to in order and will be applied together.

Example: To support a feature like simple user attribution, in the callback, the app can set the user information in a separate SharedMap against the same key. Or it could set the user information in the same underlying SharedMap against a key dervied from the original key - say against "key.attribute".

## Shared Directory With Interception

It provides `createSharedDirectoryWithInterception` that accepts a SharedDirectory, the component context and a callback, and returns a SharedDirectory object:
```typescript
function createSharedDirectoryWithInterception(
    sharedDirectory: SharedDirectory,
    context: IComponentContext,
    interceptionCallback: (key: string) => void): SharedDirectory;
```

When set is called on the SharedDirectory, it calls the interceptionCallback function with the given key. The callback funtion can perform any operation on the key. The original set operation and any operations in the callback function are batched, i.e., they are guaranteed to in order and will be applied together.

Example: To support a feature like simple user attribution, in the callback, the app can set the user information in a subDirectory of the original SharedDirectory against the same key.
