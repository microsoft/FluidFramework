---
title: Encapsulating data with DataObject
menuPosition: 3
---

In the previous section we introduced distributed data structures and demonstrated how to use them. We'll now discuss
how to combine those distributed data structures with custom code (business logic) to create modular, reusable pieces.


## The @fluidframework/aqueduct package

The Aqueduct library provides a thin layer over the core Fluid Framework interfaces that is designed to help developers
get started quickly with Fluid development.

You don't have to use the Aqueduct library. It is an example of an abstraction layer built on top of the base Fluid
Framework with a focus on making Fluid development easier, and as such you can choose to use Fluid without it.

Having said that, if you're new to Fluid, we think you'll be more effective with it than without it.


## DataObject

[DataObject][] is a base class that contains a [SharedDirectory][] and task manager. It ensures that both are created
and ready for you to access within your DataObject subclass.

```ts
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

class MyDataObject extends DataObject implements IFluidHTMLView { }
```


### The `root` SharedDirectory

DataObject has a `root` property that is a [SharedDirectory][]. Typically you will create any additional distributed data
structures during the initialization of the DataObject, as described next, and store handles to them within the root
SharedDirectory.

### DataObject lifecycle

DataObject defines three _lifecycle methods_ that you can override to create and initialize distributed data
structures:

```ts
/**
 * Called the first time, and *only* the first time, that the DataObject
 * is opened on a client. It is _not_ called on any subsequent clients that
 * open it.
 */
protected async initializingFirstTime(): Promise<void> { }

/**
  * Called every time the DataObject is initialized _from an existing
  * instance_. * Not called the first time the DataObject is initialized.
  */
protected async initializingFromExisting(): Promise<void> { }

/**
  * Called after the DataObject is initialized, regardless of whether
  * it was a first time initialization or an initialization from loading
  * an existing object.
  */
protected async hasInitialized(): Promise<void> { }
```

#### initializingFirstTime

`initializingFirstTime` is called only once. It is executed only by the _first_ client to open the DataObject and all
work will complete before the DataObject is loaded. You should implement this method to perform setup, which can include
creating distributed data structures and populating them with initial data. The `root` SharedDirectory can be used in
this method.

The following is an example from the Badge DataObject:

```ts {hl_lines=[5,10,19]}
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

{{% callout important "See also" %}}

- [Creating and storing distributed data structures](../dds/#creating-and-storing-distributed-data-structures)

{{% /callout %}}

#### initializingFromExisting

The `initializingFromExisting` method is called each time the DataObject is loaded _except_ the first time it is
created. Note that you _do not_ need to implement this method in order to load data in your distributed data structures.
Data already stored within DDSes is automatically loaded into the local client's DDS during initialization; there is no
separate load event handler that needs to be implemented by your code.

In simple scenarios, you probably won't need to implement this method, since data is automatically loaded, and you'll use
`initializingFirstTime` to create your data model initially. However, as your data model changes, this method provides
an entry point for you to run upgrade or schema migration code as needed.

#### hasInitialized

The `hasInitialized` method is called _each time_ the DataObject is loaded. One common use of this method is to stash
local references to distributed data structures so that they're available for use in synchronous code. Recall that
retrieving a value from a DDS is _always_ an asynchronous operation, so they can only be retrieved in an asynchronous
function. `hasInitialized` serves that purpose in the following example.

```ts
protected async hasInitialized() {
  this.currentCell = await this.root.get<IFluidHandle<SharedCell>>("myCell").get();
}
```

Now any synchronous code can access the SharedCell using `this.currentCell`.


## DataObjectFactory

DataObjects, like distributed data structures, are created asynchronously using a factory pattern. (Constructors in
TypeScript cannot be asynchronous, so a factory pattern is required.) Therefore you must export a factory class for a
DataObject, as the next code example illustrates.

The DataObjectFactory constructor takes the following arguments.

1. The first argument is the string name of the DataObject. This is used in logging.
1. The DataObject subclass itself.
1. An array of factories, one for each DDS used by the DataObject.
1. This argument is used in a more advanced scenario called _Providers_ that is outside the scope of this documentation.
   An empty object must be passed when Providers are not being used.

```ts
export const BadgeInstantiationFactory = new DataObjectFactory(
    BadgeName,
    Badge,
    [
      SharedMap.getFactory(),
      SharedCell.getFactory(),
      SharedObjectSequence.getFactory(),
    ],
    {},
);
```

## Learn more

The Aqueduct library contains more than just DataObject and DataObjectFactory. To dive deeper into the details, see the
[Aqueduct package README](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/README.md).


<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "/reference/concepts/containers-runtime.md" >}}

<!-- Packages -->

[Aqueduct]: {{< relref "/apis/aqueduct.md" >}}
[undo-redo]: {{< relref "/apis/undo-redo.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "/apis/aqueduct/dataobject.md" >}}
[DataObjectFactory]: {{< relref "/apis/aqueduct/dataobjectfactory.md" >}}
[Ink]: {{< relref "/apis/ink/ink.md" >}}
[SharedCell]: {{< relref "/apis/cell/sharedcell.md" >}}
[SharedCounter]: {{< relref "SharedCounter" >}}
[SharedDirectory]: {{< relref "/apis/map/shareddirectory.md" >}}
[SharedMap]: {{< relref "/apis/map/sharedmap.md" >}}
[SharedMatrix]: {{< relref "SharedMatrix" >}}
[SharedNumberSequence]: {{< relref "SharedNumberSequence" >}}
[SharedObjectSequence]: {{< relref "/apis/sequence/sharedobjectsequence.md" >}}
[SharedSequence]: {{< relref "SharedSequence" >}}
[SharedString]: {{< relref "SharedString" >}}
[Quorum]: {{< relref "/apis/protocol-base/quorum.md" >}}

<!-- Sequence methods -->

[sequence.insert]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[sequence.getItems]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequence.remove]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/apis/sequence/sequencedeltaevent.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
