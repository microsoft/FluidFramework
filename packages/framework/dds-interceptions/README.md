# @fluid-experimental/dds-interceptions

This package provides factory methods to create a wrapper around some of the basic Distributed Data Structures (DDS) that support an interception callback. Apps can provide a callback when creating these wrappers and this callback will be called when the DDS is modified. This allows apps to support features such as basic user attribution on a SharedString.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Shared String With Interception

It provides `createSharedStringWithInterception` that accepts a SharedString, the data store context and a callback, and returns a SharedString object:

```typescript
function createSharedStringWithInterception(
	sharedString: SharedString,
	context: IFluidDataStoreContext,
	propertyInterceptionCallback: (props?: MergeTree.PropertySet) => MergeTree.PropertySet,
): SharedString;
```

When a function is called that modifies the SharedString (for example, insertText), it calls propertyInterceptionCallback with the provided properties. The callback function can then provide the new set of properties that it wants to set. The operation in the called function and any operations in the callback are batched, i.e., they are guaranteed to be in order and will be applied together.

For example, to support a feature like simple user attribution, the app can append the user information to the properties in the callback. The user information can than be retrieved by getting the properties at any position.

## Shared Map With Interception

It provides `createSharedMapWithInterception` that accepts a SharedMap, the data store context and a callback, and returns a SharedMap object:

```typescript
function createSharedMapWithInterception(
	sharedMap: SharedMap,
	context: IFluidDataStoreContext,
	setInterceptionCallback: (sharedMap: ISharedMap, key: string, value: any) => void,
): SharedMap;
```

When set is called on the SharedMap, it calls setInterceptionCallback with the underlying SharedMap, the key and value that the set was called with. The callback function can then perform operations on either the underlying SharedMap or any other DDS. The original set operation and any operations in the callback are batched, i.e., they are guaranteed to be in order and will be applied together.

Example: To support a feature like simple user attribution, in the callback, the app can set the user information in the underlying SharedMap against a key derived from the original key - say against "key.attribute". Or, it could use a separate SharedMap to store the user information against the same key.

## Shared Directory / Sub Directory With Interception

It provides `createdDirectoryWithInterception` that accepts an IDirectory object, the data store context and a callback, and returns an IDirectory object:

```typescript
function createDirectoryWithInterception<T extends IDirectory>(
	baseDirectory: T,
	context: IFluidDataStoreContext,
	setInterceptionCallback: (
		baseDirectory: IDirectory,
		subDirectory: IDirectory,
		key: string,
		value: any,
	) => void,
): T;
```

It can be used to wrap a SharedDirectory or one of it's subdirectories to get an interception callback when set is called on the object. The callback function is passed the following:

-   baseDirectory: This is the outermost directory in this directory structure that was wrapped. For example, when a SharedDirectory (say 'root') is wrapped, then a set on it or any of its sub directories will be passed 'root' as the baseDirectory.
-   subDirectory: This is the directory that the set is called on and which calls the callback.
-   key: They key that set was called with.
-   value: They value that set was called with.

The original set operation and any operations in the callback function are batched, i.e., they are guaranteed to in order and will be applied together.

Example: To support a feature like simple user attribution, in the callback, the app can set the user information in a sub directory of the original object against the same key.

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
