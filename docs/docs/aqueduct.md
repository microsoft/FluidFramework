# Encapsulating data with FluidObjects

## The Aqueduct package

![Aqueduct](https://publicdomainvectors.org/photos/johnny-automatic-Roman-aqueducts.png)

The Aqueduct is a library for building Fluid components within the Fluid Framework. Its goal is to provide a thin layer
over the existing Fluid Framework interfaces that allows developers to get started quickly with component development.

You don't have to use the Aqueduct. It is an example of an abstraction layer built on top of the base Fluid Framework
with a focus on making component development easier, and as such you can choose to implement components without it.

Having said that, if you're new to Fluid, we think you'll be more effective with it than without it.

---

**Contents:**

[[toc]]

---


## A note about Containers

::: tip

Coming soon

:::

## DataObject

```ts
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

class MyComponent extends DataObject implements IComponentHTMLView { }
```

[DataObject][] is a base component class that is [primed](https://en.wiktionary.org/wiki/primed#Adjective) with a
[SharedDirectory][] and task manager. It ensures that both are created and ready for you to access within your component.

### The `root` SharedDirectory

### DataObject lifecycle

DataObject defines three _lifecycle methods_ that you can override to create and initialize distributed data
structures:

```ts
/**
 * Called the first time the component is initialized.
 */
protected async componentInitializingFirstTime(): Promise<void> { }

/**
  * Called every time *except* first time the component is initialized.
  */
protected async componentInitializingFromExisting(): Promise<void> { }

/**
  * Called every time the component is initialized after create or existing.
  */
protected async componentHasInitialized(): Promise<void> { }
```

#### componentInitializingFirstTime

ComponentInitializingFirstTime is called only once. It is executed only by the _first_ client to open the component and
all work will resolve before the component is presented to any user. You should overload this method to perform
component setup, which can include creating distributed data structures and populating them with initial data.
The `root` SharedDirectory can be used in this method.

The following is an example from the Badge component.

```ts{5,10,19}
protected async componentInitializingFirstTime() {
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
- [How to write a visual component](./visual-component.md)

:::

#### componentInitializingFromExisting

::: danger TODO

- Data in DDS is loaded automatically
- Can use this to adjust schema over time (?)

:::

#### On every load

::: danger TODO

- Data in DDS is loaded automatically

:::

## DataObjectFactory


## Learn more

The Aqueduct contains much more than just DataObject. To dive deeper into the details, see the [Aqueduct package
README](https://github.com/microsoft/FluidFramework/blob/master/packages/framework/aqueduct/README.md)


!!!include(links.md)!!!
