# @fluidframework/aqueduct

![Aqueduct](https://publicdomainvectors.org/photos/johnny-automatic-Roman-aqueducts.png)

The Aqueduct is a library for building Components and Containers within the Fluid Framework. Its goal is to provide a thin base layer over the existing Fluid Framework interfaces that allows developers to get started quickly.

## Component Development

Fluid component development consists of developing the Component Object and the corresponding Factory Object. The Component Object defines the logic of your component, whereas the Factory Object defines how to initialize your object.

### Component Object Development

The `PrimedComponent` and the `SharedComponent` are the two base component objects provided by the library.

#### [`PrimedComponent`](./src/components/primedComponent.ts)

The [`PrimedComponent`](./src/components/primedComponent.ts) extends the [`SharedComponent`](####SharedComponent) and provides all of its functionality as well as the following additional functionality:

- A `root` SharedDirectory that makes creating and storing Distributed Data Structures and Components easy.
- Scheduled Task routing that makes it easier to use the Scheduler Component
- Blob Storage implementation that makes it easier to store and retrieve blobs.

> Note: Most developers will want to use the PrimedComponent as their base class to extend.

#### [`SharedComponent`](./src/components/sharedComponent.ts)

The [`SharedComponent`](./src/components/sharedComponent.ts) provides the following functionality:

- Basic set of interface implementations to be loadable in a Fluid Container.
- Functions for managing component lifecycle.
  - `componentInitializingFirstTime(props: S)` - called only the first time a component is initialized
  - `componentInitializingFromExisting()` - called every time except the first time a component is initialized
  - `componentHasInitialized()` - called every time after `componentInitializingFirstTime` or `componentInitializingFromExisting` executes
- Helper functions for creating and getting other Component Objects in the same Container.

> Note: You probably don't want to inherit from this component directly unless you are creating another base component class. If you have a component that doesn't use Distributed Data Structures you should use Container Services to manage your object.

#### Component Object Example

In the below example we have a simple Component Object that will render a value alongside a button the the page. Every time the button is pressed the value will increment. Because this Component Object renders to the DOM it also extends `IComponentHTMLView`.

```jsx
export class Clicker extends PrimedComponent implements IComponentHTMLView {

    public static get ComponentName() { return "clicker"; }

    public get IComponentHTMLView() { return this; }

    protected async componentInitializingFirstTime() {
        this.root.createValueType("clicks", CounterValueType.Name, 0);
    }

    public render(div: HTMLElement) {
        const counter = this.root.get("clicks");
        const rerender = () => {
            ReactDOM.render(
                <div>
                    <span>{counter.value}</span>
                    <button onClick={() => { counter.increment(1); }}>+</button>
                </div>,
                div,
            );
        };

        counter.on("incremented", (incrementValue: number, currentValue: number) => {
            rerender();

        });

        rerender();
    }
}
```

### Component Factory Object Development

The Component Factory Object is used to create a component and to initialize a Component Object within the context of a Container. The Factory can live alongside a Component Object or within a different package. The Component Factory Object defines the Distributed Data Structures used within the Component Object as well as the Sub-Components of the object. Sub-Components are other Component Objects required by the Component Object. Think of this as a list of dependencies.

The Aqueduct offers a factory for each of the Component Objects provided.

> [`SharedComponentFactory`](./src/componentFactories/sharedComponentFactory.ts) for the `SharedComponent`

>[`PrimedComponentFactory`](./src/componentFactories/primedComponentFactory.ts) for the `PrimedComponent`

#### Component Factory Object Example

In the below example we build a Component Factory for the [`Clicker`](####Component-Object-Example) example above. In the above example we use `this.root` to store our `"clicks"`. The `PrimedComponent` comes with the `SharedDirectory` already initialized so we do not need to add additional Distributed Data Structures.

```typescript
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    Clicker.ComponentName
    Clicker,
    [], // Distributed Data Structures
    {}, // Provider Symbols see below
);
```
This factory can then create Clickers when provided a creating component context.
```typescript
const myClicker = ClickerInstantiationFactory.createComponent(this.context) as Clicker;
```

#### Component Object/Factory with Initial State Example

If we want to be able to create a component and provide an initial state, we amend our component example as follows to define an initial state type and to define this type as a generic on PrimedComponentFactory. We then allow `componentInitializingFirstTime` to take an initial state object.
```typescript
export interface IClickerInitialState {
    initialValue: number;
}

export class ClickerWithInitialValue extends PrimedComponent<{}, IClickerInitialState> implements IComponentHTMLView {
    protected async componentInitializingFirstTime(initialState?: IClickerInitialState) {
        let startingValue = 0;
        if (initialState) {
            startingValue = initialState.initialValue;
        }

        this.root.createValueType("clicks", CounterValueType.Name, startingValue);
    }

    ...

}
```
No changes are needed to the factory definition.  The same generics are defined in the factory, but are inferred from constructor arguments.  When creating a component this way, initial state may be optionally provided in the creation call.
```typescript
const myClickerWithValue = ClickerWithInitialValueFactory.createComponent(this.context, { initialValue: 2020 })
```

#### Providers in Components

The `this.providers` object on `SharedComponent` is initialized in the constructor and is generated based on Providers provided by the Container. To access a specific provider you need to:

1. Define the type in the generic on Primed/SharedComponent
2. Add the symbol to your Factory (see [Component Factory Object Example](####Component-Factory-Object-Example) below)

In the below example we have an `IComponentUserInfo` interface that looks like this:

```typescript
interface IComponentUserInfo {
    readonly userCount: number;
}
```

On our example we want to declare that we want the `IComponentUserInfo` Provider and get the `userCount` if the Container provides the `IComponentUserInfo` provider.

```typescript
export class MyExample extends PrimedComponent<IComponentUserInfo> {
    protected async componentInitializingFirstTime() {
        const userInfo = await this.providers.IComponentUserInfo;
        if(userInfo) {
            console.log(userInfo.userCount);
        }
    }
}

// Note: we have to define the symbol to the IComponentUserInfo that we declared above. This is compile time checked.
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    Clicker.ComponentName
    Clicker,
    [], // Distributed Data Structures
    {IComponentUserInfo}, // Provider Symbols see below
);
```

## Container Development

A Container is a collection of Components and functionality that produce an experience. Containers hold the instances of Component Objects as well as defining the Component Objects that can be created within the Container. Because of this Component Objects cannot be consumed except for when they are within a Container.

The Aqueduct provides the [`ContainerRuntimeFactoryWithDefaultComponent`](./src/containerRuntimeFactories/containerRuntimeFactoryWithDefaultComponent.ts) that allows you as a Container developer to:

- Define the registry of Component Objects that can be created
- Declare the Default Component
- Declare [Container Services](###Container-Service-Development)
- Declare Container Level [Request Handlers](###Container-Level-Request-Handlers)

### Container Object Example

In the below example we will write a Container that exposes the above [`Clicker`](####Component-Object-Example) using the [`Clicker Factory`](####Component-Factory-Object-Example). You will notice below that the Container developer defines the registry name (component type) of the component. We also pass in the type of component we want to be the default. The default component is created the first time the Container is created.

```typescript
export fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
  ClickerInstantiationFactory.type, // Default Component Type
  ClickerInstantiationFactory.registryEntry, // Component Registry
  [], // Provider Entries
  [], // Request Handler Routes
);
```

### Provider Entries Development

The Container developer can optionally provide a Registry of ProviderEntry objects into the Container. A ProviderEntry is defined as follows:

```typescript
interface ProviderEntry<T extends keyof IComponent> {
    type: T;
    provider: ComponentProvider<T>
}
```

The `type` must be a keyof `IComponent`. This basically means that it needs to be the name of an interfaces that extends off of `IComponent`. The `provider` must be something that provides the interface defined in `type`. The `DependencyContainer` we use in the `@fluidframework/synthesize`
package defines the follow `ComponentProvider` types:

```typescript
type ComponentProvider<T extends keyof IComponent> =
    IComponent[T]
    | Promise<IComponent[T]>
    | ((dependencyContainer: DependencyContainer) => IComponent[T])
    | ((dependencyContainer: DependencyContainer) => Promise<IComponent[T]>);
```

```typescript
IComponent[T]
```

An object that implements the interface.

```typescript
Promise<IComponent[T]>
```

A Promise to an object that implements the interface

```typescript
(dependencyContainer: DependencyContainer) => IComponent[T]
```

A factory that will return the object.

```typescript
(dependencyContainer: DependencyContainer) => Promise<IComponent[T]>
```

A factory that will return a Promise to the object.

### Container Level Request Handlers

You can provide custom Request Handlers to the Container. These request handlers are injected after system handlers but before the component get. Request Handlers allow you to intercept request made to the container and return custom responses.

Consider a scenario where you want to create a random color generator. I could create a RequestHandler that when someone makes a request to the Container for `{url:"color"}` will intercept and return a custom `IResponse` of `{ status:200, type:"text/plain", value:"blue"}`.

We use custom handlers to build the [Container Services](###Container-Service-Development) pattern.
