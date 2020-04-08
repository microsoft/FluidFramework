# Aqueduct

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
  - `componentInitializingFirstTime(props: any)` - called only the first time a component is initialized
  - `componentInitializingFromExisting()` - called every time except the first time a component is initialized
  - `componentHasInitialized()` - called every time after `componentInitializingFirstTime` or `componentInitializingFromExisting` executes
- Helper functions for creating and getting other Component Objects in the same Container.

> Note: You probably don't want to inherit from this component directly unless you are creating another base component class. If you have a component that doesn't use Distributed Data Structures you should use Container Services to manage your object.

#### Component Object Example

In the below example we have a simple Component Object that will render a value alongside a button the the page. Every time the button is pressed the value will increment. Because this Component Object renders to the DOM it also extends `IComponentHTMLView`.

```jsx
export class Clicker extends PrimedComponent implements IComponentHTMLView {

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

The Component Factory Object is used to initialize a Component Object within the context of a Container. The Factory can live alongside a Component Object or within a different package. The Component Factory Object defines the Distributed Data Structures used within the Component Object as well as the Sub-Components of the object. Sub-Components are other Component Objects required by the Component Object. Think of this as a list of dependencies.

The Aqueduct offers a factory for each of the Component Objects provided.

> [`SharedComponentFactory`](./src/componentFactories/sharedComponentFactory.ts) for the `SharedComponent`
> [`PrimedComponentFactory`](./src/componentFactories/primedComponentFactory.ts) for the `PrimedComponent`

#### Component Factory Object Example

In the below example we build a Component Factory for the [`Clicker`](####Component-Object-Example) example above. In the above example we use `this.root` to store our `"clicks"`. The `PrimedComponent` comes with the `SharedDirectory` already initialized so we do not need to add additional Distributed Data Structures.

```typescript
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    Clicker,
    [], // Distributed Data Structures
);
```

## Container Development

A Container is a collection of Components and functionality that produce an experience. Containers hold the instances of Component Objects as well as defining the Component Objects that can be created within the Container. Because of this Component Objects cannot be consumed except for when they are within a Container.

The Aqueduct provides the [`DefaultComponentContainerRuntimeFactory`](./src/containerRuntimeFactories/defaultComponentContainerRuntimeFactory.ts) that allows you as a Container developer to:

- Define the registry of Component Objects that can be created
- Declare the Default Component
- Declare [Container Services](###Container-Service-Development)
- Declare Container Level [Request Handlers](###Container-Level-Request-Handlers)

### Container Object Example

In the below example we will write a Container that exposes the above [`Clicker`](####Component-Object-Example) using the [`Clicker Factory`](####Component-Factory-Object-Example). You will notice below that the Container developer defines the registry name (component type) of the component. We also pass in the type of component we want to be the default. The default component is created the first time the Container is created.

```typescript
export fluidExport = new DefaultComponentContainerRuntimeFactory(
  "clicker", // Default Component Type
  ["clicker", Promise.resolve(ClickerInstantiationFactory)], // Component Registry
  [], // Container Services
  [], // Request Handler Routes
);
```

### Container Service Development

Container Services allow developers to write Components that don't use Distributed Data Structures. These types of Components are helpful when you want to share state among all the parts of a Container but you don't need to share the state outside the session. ContainerServices have the benefit of not being saved into the snapshot. This makes them lightweight compared to Runtime Components and easier to version.

An example of this could be a local clipboard service that manages the clipboard across all the Distributed Components in the Container but not across users.

The concept of Container Services is simple. We define a specific request route that when queried against returns and IComponent object. The Container Developer provides the list of Container Services that other Components can query for. These IComponent objects are different from the Components we talked about before in the sense that they do not directly have a `ComponentRuntime` backing them so they can not have Distributed Data Structures. Because they don't contain Distributed State they only exist in memory and will be re-created either with every Container instantiation or on every call (depending on the type).

Container Services have the benefit of being able to access the `IHostRuntime` object which allows them to interact directly with the Container if they choose.

The Aqueduct provides an optional base class for building Container Services. Components that extend `SharedComponent` also have a helper function `getService(id:string)` which will return service objects.

#### BaseContainerService

The `BaseContainerService` class provides a starting class with a basic implementation if `IComponentRouter`.

### Container Level Request Handlers

You can provide custom Request Handlers to the Container. These request handlers are injected after system handlers but before the component get. Request Handlers allow you to intercept request made to the container and return custom responses.

Consider a scenario where you want to create a random color generator. I could create a RequestHandler that when someone makes a request to the Container for `{url:"color"}` will intercept and return a custom `IResponse` of `{ status:200, type:"text/plain", value:"blue"}`.

We use custom handlers to build the [Container Services](###Container-Service-Development) pattern.
