# Aqueduct

![Aqueduct](https://publicdomainvectors.org/photos/johnny-automatic-Roman-aqueducts.png)

The Aqueduct is a library for building Components and Containers within the Fluid Framework. It's goal is to provide a thin base layer over the existing Fluid Framework interfaces that allows developers to get started quickly.

## Component Development

Fluid component development consists of developing the Component Object and the corresponding Factory Object. The Component Object defines the logic of your component where the Factory Object defines how to initialize your object.

### Component Object Development

The `SharedComponent` and the `PrimedComponent` are the two base component objects provided by the library.

#### [`SharedComponent`](./src/components/sharedComponent.ts)

The [`SharedComponent`](./src/components/sharedComponent.ts) provides the following functionality:

- Basic set of interface implementations to be loadable in a Fluid Container.
- Functions for managing component lifecycle.
  - `componentInitializingFirstTime(props: any)`
  - `componentInitializingFromExisting()`
  - `componentHasInitialized()`
- Helper functions for creating and getting other Component Objects in the same Container.

> Note: You probably don't want to inherit from this component directly unless you are creating another base component class. If you have a component that doesn't use Distributed Data Structures you should use Container Services to manage your object.

#### [`PrimedComponent`](./src/components/primedComponent.ts)

The [`PrimedComponent`](./src/components/primedComponent.ts) extends the [`SharedComponent`](####SharedComponent) and provides all of its functionality as well as the following additional functionality:

- A `root` directory that makes creating and storing Distributed Data Structures and Components simple.
- Scheduled Task routing that makes it easier to use the Scheduler Component
- Blob Storage implementation that makes it easier to store and retrieve blobs.

> Note: Most developers will want to use the PrimedComponent as their base class to extend.

#### Component Object Example

In the blow example we have a simple Component Object that will render a value alongside a button the the page. Every time the button is pressed the value will increment. Because this Component Object render to the DOM it also extends `IComponentHTMLVisual`.

```jsx
export class Clicker extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

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

The Component Factory Object is used to initialize a Component Object within the context of a Container. The Factory can live along side a Component Object or within a different package. The Component Factory Object defines the Distributed Data Structures used within the Component Object as well as the Sub-Components of the object. Sub-Components are other Component Objects required by the Component Object. Think of this a list of dependencies.

The Aqueduct offers a factory for each of the Component Objects provided.

> [`SharedComponentFactory`](./src/helpers/sharedComponentFactory.ts) for the `SharedComponent`  
> [`PrimedComponentFactory`](./src/helpers/primedComponentFactory.ts) for the `PrimedComponent`

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

The Aqueduct provide the [`SimpleModuleInstantiationFactory`](./src/helpers/simpleModuleInstantiationFactory.ts) that allows you as a Container developer to:

- Define the registry of Component Objects that can be created
- Declare the Default Component

### Container Object Example

In the below example we will write a Container that exposes the above [`Clicker`](####Component-Object-Example) using the [`Clicker Factory`](####Component-Factory-Object-Example). You will notice below that the Container developer defines the registry name (component type) of the component. We also pass in the type of component we want to be the default. The default component is created the first time the Container is created.

```typescript
export fluidExport = new SimpleModuleInstantiationFactory(
  "clicker", // Default Component Type
  ["clicker", Promise.resolve(ClickerInstantiationFactory)], // Component Registry
);
```
