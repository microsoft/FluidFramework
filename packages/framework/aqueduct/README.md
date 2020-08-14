# @fluidframework/aqueduct

![Aqueduct](https://publicdomainvectors.org/photos/johnny-automatic-Roman-aqueducts.png)

The Aqueduct is a library for building FluidObjects and Containers within the Fluid Framework. Its goal is to provide a thin base layer over the existing Fluid Framework interfaces that allows developers to get started quickly.

## Fluid Object Development

Fluid Object development consists of developing the Data Object and the corresponding Data Object Factory. The Data Object defines the logic of your Fluid Object, whereas the Data Object Factory defines how to initialize your object.

### Data Object Development

The `DataObject` and the `PureDataObject` are the two base data objects provided by the library.

#### [`DataObject`](./src/data-objects/dataObject.ts)

The [`DataObject`](./src/data-objects/dataObject.ts) extends the [`PureDataObject`](####PureDataObject) and provides all of its functionality as well as the following additional functionality:

- A `root` SharedDirectory that makes creating and storing Distributed Data Structures and Objects easy.
- Scheduled Task routing that makes it easier to use the Scheduler Fluid Object
- Blob Storage implementation that makes it easier to store and retrieve blobs.

> Note: Most developers will want to use the DataObject as their base class to extend.

#### [`PureDataObject`](./src/data-object/PureDataObject.ts)

The [`PureDataObject`](./src/data-object/PureDataObject.ts) provides the following functionality:

- Basic set of interface implementations to be loadable in a Fluid Container.
- Functions for managing Fluid Object lifecycle.
  - `initializingFirstTime(props: S)` - called only the first time a Fluid Object is initialized
  - `initializingFromExisting()` - called every time except the first time a Fluid Object is initialized
  - `hasInitialized()` - called every time after `initializingFirstTime` or `initializingFromExisting` executes
- Helper functions for creating and getting other Data Objects in the same Container.

> Note: You probably don't want to inherit from this data object directly unless you are creating another base data object class. If you have a data object that doesn't use Distributed Data Structures you should use Container Services to manage your object.

#### Data Object Example

In the below example we have a simple Data Object that will render a value alongside a button the the page. Every time the button is pressed the value will increment. Because this Data Object renders to the DOM it also extends `IFluidHTMLView`.

```jsx
export class Clicker extends DataObject implements IFluidHTMLView {
    public static get Name() { return "clicker"; }

    public get IFluidHTMLView() { return this; }

    private _counter: SharedCounter | undefined;

    protected async initializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set("clicks", counter.handle);
    }

    protected async hasInitialized() {
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>("clicks");
        this._counter = await counterHandle.get();
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <CounterReactView counter={this.counter} />,
            div,
        );
        return div;
    }

    private get counter() {
        if (this._counter === undefined) {
            throw new Error("SharedCounter not initialized");
        }
        return this._counter;
    }
}
```

### Data Object Factory Development

The Data Object Factory is used to create a Fluid Object and to initialize a Data Object within the context of a Container. The Factory can live alongside a Data Object or within a different package. The Data Object Factory defines the Distributed Data Structures used within the Data Object as well as any Fluid Objects it depends on.

The Aqueduct offers a factory for each of the Data Objects provided.

> [`DataObjectFactory`](./src/data-object-factories/dataObjectFactory.ts)

>[`PureDataObjectFactory`](./src/data-object-factories/pureDataObjectFactory.ts)

#### Data Object Factory Example

In the below example we build a Data Object Factory for the [`Clicker`](####Data-Object-Example) example above. In the above example we use `this.root` to store our `"clicks"`. The `DataObject` comes with the `SharedDirectory` already initialized so we do not need to add additional Distributed Data Structures.

```typescript
export const ClickerInstantiationFactory = new DataObjectFactory(
    Clicker.Name,
    Clicker,
    [SharedCounter.getFactory()], // Distributed Data Structures
    {}, // Provider Symbols see below
);
```
This factory can then create Clickers when provided a creating instance context.
```typescript
const myClicker = ClickerInstantiationFactory.createInstance(this.context) as Clicker;
```

#### Providers in Data Objects

The `this.providers` object on `DataObject` is initialized in the constructor and is generated based on Providers provided by the Container. To access a specific provider you need to:

1. Define the type in the generic on Pure/DataObject
2. Add the symbol to your Factory (see [Data Object Factory Example](####Data-Object-Factory-Example) below)

In the below example we have an `IFluidUserInfo` interface that looks like this:

```typescript
interface IFluidUserInfo {
    readonly userCount: number;
}
```

On our example we want to declare that we want the `IFluidUserInfo` Provider and get the `userCount` if the Container provides the `IFluidUserInfo` provider.

```typescript
export class MyExample extends DataObject<IFluidUserInfo> {
    protected async initializingFirstTime() {
        const userInfo = await this.providers.IFluidUserInfo;
        if(userInfo) {
            console.log(userInfo.userCount);
        }
    }
}

// Note: we have to define the symbol to the IFluidUserInfo that we declared above. This is compile time checked.
export const ClickerInstantiationFactory = new DataObjectFactory(
    Clicker.Name
    Clicker,
    [], // Distributed Data Structures
    {IFluidUserInfo}, // Provider Symbols see below
);
```

## Container Development

A Container is a collection of Data Objects and functionality that produce an experience. Containers hold the instances of Data Objects as well as defining the Data Objects that can be created within the Container. Because of this Data Objects cannot be consumed except for when they are within a Container.

The Aqueduct provides the [`ContainerRuntimeFactoryWithDataStore`](./src/containerRuntimeFactories/containerRuntimeFactoryWithDataStore.ts) that allows you as a Container developer to:

- Define the registry of Data Objects that can be created
- Declare the Default Data Object
- Declare [Container Services](###Container-Service-Development)
- Declare Container Level [Request Handlers](###Container-Level-Request-Handlers)

### Container Object Example

In the below example we will write a Container that exposes the above [`Clicker`](####Data-Object-Example) using the [`Clicker Factory`](####Data-Object-Factory-Example). You will notice below that the Container developer defines the registry name (Data Object type) of the Fluid Object. We also pass in the type of Data Object we want to be the default. The default Data Object is created the first time the Container is created.

```typescript
export fluidExport = new ContainerRuntimeFactoryWithDataStore(
  ClickerInstantiationFactory.type, // Default Data Object Type
  ClickerInstantiationFactory.registryEntry, // Fluid Object Registry
  [], // Provider Entries
  [], // Request Handler Routes
);
```

### Provider Entries Development

The Container developer can optionally provide a Registry of ProviderEntry objects into the Container. A ProviderEntry is defined as follows:

```typescript
interface ProviderEntry<T extends keyof IFluidObject> {
    type: T;
    provider: FluidProvider<T>
}
```

The `type` must be a keyof `IFluidObject`. This basically means that it needs to be the name of an interfaces that extends off of `IFluidObject`. The `provider` must be something that provides the interface defined in `type`. The `DependencyContainer` we use in the `@fluidframework/synthesize`
package defines the follow `FluidObjectProvider` types:

```typescript
type FluidObjectProvider<T extends keyof IFluidObject> =
    IFluidObject[T]
    | Promise<IFluidObject[T]>
    | ((dependencyContainer: DependencyContainer) => IFluidObject[T])
    | ((dependencyContainer: DependencyContainer) => Promise<IFluidObject[T]>);
```

```typescript
IFluidObject[T]
```

An object that implements the interface.

```typescript
Promise<IFluidObject[T]>
```

A Promise to an object that implements the interface

```typescript
(dependencyContainer: DependencyContainer) => IFluidObject[T]
```

A factory that will return the object.

```typescript
(dependencyContainer: DependencyContainer) => Promise<IFluidObject[T]>
```

A factory that will return a Promise to the object.

### Container Level Request Handlers

You can provide custom Request Handlers to the Container. These request handlers are injected after system handlers but before the Data Object get. Request Handlers allow you to intercept request made to the container and return custom responses.

Consider a scenario where you want to create a random color generator. I could create a RequestHandler that when someone makes a request to the Container for `{url:"color"}` will intercept and return a custom `IResponse` of `{ status:200, type:"text/plain", value:"blue"}`.

We use custom handlers to build the [Container Services](###Container-Service-Development) pattern.
