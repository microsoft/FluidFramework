# Encapsulating data with `DataObject`

In the previous section we introduced distributed data structures and demonstrated how to use them. We'll now discuss
how to combine those distributed data structures with custom code (business logic) to create modular, reusable pieces.


## The @fluidframework/aqueduct package

The Aqueduct is a library designed to provide a thin layer over the existing Fluid Framework interfaces that allows
developers to get started quickly with Fluid development.

You don't have to use the Aqueduct. It is an example of an abstraction layer built on top of the base Fluid Framework
with a focus on making Fluid development easier, and as such you can choose to use Fluid without it.

Having said that, if you're new to Fluid, we think you'll be more effective with it than without it.


## DataObject

[DataObject][] is a base class that contains a [SharedDirectory][] and task manager. It ensures that both are created
and ready for you to access within your DataObject subclass.

```ts
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

class MyDataObject extends DataObject implements IFluidHTMLView { }
```


### The `root` SharedDirectory

DataObject has a `root` property that is a [SharedDirectory][]. Typically you will create any additional distributed data
structures during the initialization of the DataObject, as described below, and store handles to them within the root
SharedDirectory.

### DataObject lifecycle

DataObject defines three _lifecycle methods_ that you can override to create and initialize distributed data
structures:

```ts
/**
 * Called the first time -- and *only* the first time -- the DataObject is initialized.
 */
protected async initializingFirstTime(): Promise<void> { }

/**
  * Called every time *except* the first time the DataObject is initialized.
  */
protected async initializingFromExisting(): Promise<void> { }

/**
  * Called every time the DataObject is initialized after create or when loaded from existing.
  */
protected async hasInitialized(): Promise<void> { }
```

#### initializingFirstTime

`initializingFirstTime` is called only once. It is executed only by the _first_ client to open the DataObject and all
work will complete before the DataObject is loaded. You should overload this method to perform setup, which can include creating
distributed data structures and populating them with initial data. The `root` SharedDirectory can be used in this
method.

The following is an example from the Badge DataObject:

```ts{5,10,19}
protected async initializingFirstTime() {
    // Create a cell to represent the Badge's current state
    const current = SharedCell.create(this.runtime);
    current.set(this.defaultOptions[0]);
    this.root.set(this.currentId, current.handle);

    // Create a map to represent the options for the Badge
    const options = SharedMap.create(this.runtime);
    this.defaultOptions.forEach((v) => options.set(v.key, v));
    this.root.set(this.optionsId, options.handle);

    // Create a sequence to store the badge's history
    const badgeHistory =
        SharedObjectSequence.create<IHistory<IBadgeType>>(this.runtime);
    badgeHistory.insert(0, [{
        value: current.get(),
        timestamp: new Date(),
    }]);
    this.root.set(this.historyId, badgeHistory.handle);
}
```

Notice that three distributed data structures are created and populated with initial data, then stored within the `root`
SharedDirectory.

::: tip See also

- [Creating and storing distributed data structures](./dds.md#creating-and-storing-distributed-data-structures)

:::

#### initializingFromExisting

The `initializingFromExisting` method is called each time the DataObject is loaded _except_ the first time it
is created. Note that you _do not_ need to overload this method in order to load data in your distributed data
structures. Data stored within DDSes is automatically loaded into the DDS during initialization; there is no separate
load step that needs to be accounted for.

In simple scenarios, you probably won't need to overload this method, since data is automatically loaded, and you'll use
`initializingFirstTime` to create your data model initially. However, as your data model changes, this method provides
an entrypoint for you to run upgrade or schema migration code as needed.

#### hasInitialized

The `hasInitialized` method is called _each time_ the DataObject is loaded. One common use of this method is to stash
local references to distributed data structures so that they're available for use in synchronous code. Recall that
retrieving a value from a DDS is _always_ an asynchronous operation, so they can only be retrieved in an async function.
`hasInitialized` serves that purpose in the example below.

```ts
protected async hasInitialized() {
  this.currentCell = await this.root.get<IFluidHandle<SharedCell>>("myCell").get();
}
```

Now any synchronous code can access the SharedCell using `this.currentCell`.


## DataObjectFactory

DataObjects, like distributed data structures, are created asynchronously using a factory pattern. Therefore you must
export a factory class for a DataObject, as the following code illustrates:

```ts
export const BadgeInstantiationFactory = new DataObjectFactory(
    BadgeName, // string
    Badge, // a subclass of DataObject
    [
      // factories for the DDSes this DataObject uses
      SharedMap.getFactory(),
      SharedCell.getFactory(),
      SharedObjectSequence.getFactory(),
    ],
    {}, // optionalProviders; this is an advanced scenario
        // outside the scope of this documentation. Despite
        // being optional, an empty object _must_ be passed
        // when Providers are not being used.
);
```

The DataObjectFactory constructor takes the following arguments:

1. The first argument is the string name of the DataObject. This is used in logging.
1. The DataObject subclass itself.
1. An array of factories, one for each DDS used by the DataObject.
1. This argument is used in a more advanced scenario called _Providers_ that is outside the scope of this documentation.
   Despite being optional, an empty object _must_ be passed when Providers are not being used.

## Learn more

The Aqueduct contains more than just DataObject and DataObjectFactory. To dive deeper into the details, see the
[Aqueduct package README](https://github.com/microsoft/FluidFramework/blob/master/packages/framework/aqueduct/README.md)
