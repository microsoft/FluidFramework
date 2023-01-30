# @fluid-example/table-document

## Table Slice With Interception

It provides `createTableWithInterception` that accepts an ITable object, the data store context and a callback, and returns an ITable object:

```typescript
function createTableWithInterception<T extends ITable>(
	table: T,
	context: IFluidDataStoreContext,
	propertyInterceptionCallback: (props?: PropertySet) => PropertySet,
): T;
```

When a function is called that set a cell value or annotates a cell, it calls propertyInterceptionCallback with the provided properties. The callback funtion can then provide the new set of properties that it wants to set. The operation in the called function and any operations in the callback are batched, i.e., they are guaranteed to be in order and will be applied together.

For example, to support a feature like simple user attribution, the app can append the user information to the properties in the callback. The user information can than be retrieved by getting the properties of the cell.
