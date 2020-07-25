# How to write a visual component

## Introducing IComponentHtmlView

All Fluid components expose their capabilities using the `IComponentX` interface pattern. Please see [Feature detection
and delegation](./components.md#feature-detection-and-delegation) for more information on this.

As such, any component that provides a view -- that is, a component that is presented to the user visually -- exposes
this capability by implementing the `IComponentHTMLView` interface provided by the Fluid Framework. Let's take a look at
what this interface needs:

```typescript
/**
 * An IComponentHTMLView is a renderable component
 */
export interface IComponentHTMLView extends IProvideComponentHTMLView {
    /**
     * Render the component into an HTML element.
     */
    render(elm: HTMLElement, options?: IComponentHTMLOptions): void;

    /**
     * Views which need to perform cleanup (e.g. remove event listeners, timers, etc.) when
     * removed from the DOM should implement remove() and perform that cleanup within.
     */
    remove?(): void;
}

export interface IProvideComponentHTMLView {
    readonly IComponentHTMLView: IComponentHTMLView;
}
```

As we can see, the two functions that we must implement are the `IComponentHTMLView` identifier and a `render(elm:
HTMLElement)` function. `remove()` is not mandatory and only necessary for clean up operations when the view is being
removed.

- `IComponentHTMLView` can simply provide itself as `this` to identify that this component itself is a view provider.
  With Fluid, each component uses the identifiers to expose their capabilities and are anonymous interfaces otherwise.
  As such, another component (`componentB`) that does not know if this component (`componentA`) provides a view but can
  check by seeing if `componentA.IComponentHTMLView` is defined or not. If `componentA.IComponentHTMLView` is defined,
  it is guaranteed to return a `IComponentHTMLView` object. At this point, it can render `componentA` by calling
  `componentA.IComponentHTMLView.render()`. This may seem initially confusing but the example below should demonstrate
  its ease of implementation and you can read [here](../docs/components.md#feature-detection-and-delegation) for more
  reference.
- `render` is a function that takes in the parent HTML document element and allows children to inject their views into
  it. The `elm` parameter passed in here can be modified and returned. If you are using React as your view framework,
  this is where you would pass the `elm` to the `ReactDOM.render` function to start rendering React components

```typescript
public render(elm: HTMLElement) {
        ReactDOM.render(
            <View props={...} />,
            elm,
        );
    }
 ```


To see an example of how a Fluid component can implement this interface, we will be looking at a simple `Clicker`
component that consists of a label with a number starting at `0` and a button that increments the displayed number for
all users simultaneously.

Over the course of this example, we will incrementally build out our entire component in one file. The Fluid Framework codebase offers two options for building views:

- Option A: Using a robust, event-driven pattern that can be emulated for different view frameworks with `PrimedComponent`, and is also used to power pure data components
- Option B: Using `SyncedComponent`, that provides UI framework-based scaffolding to reduce code writing specifically for view component developers. This is currently under development and only supports React but will be extended to Vue, Angular, and other frameworks in the future

The final two versions of the code can be found at the bottom of each section. Each of these files define an entire, self-sufficient
Fluid component that can be exported in its own package.

## OPTION A: Event-Driven Views

### Setting Up the Fluid Component

Before we write our view, we first need to build the Fluid object, `PrimedComponent`, where the view will be rendered in,
and bring in the necessary imports. Below is the initial code to get you started; we will incrementally build on this
throughout the example. The final result of this file is sufficient to produce a standalone component, and can be
supplied as the `main` script in your component `package.json`.

Alright, lets take a look at some initial scaffolding.

```typescript
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";

const ClickerName = "Clicker";
export class Clicker extends PrimedComponent {
}

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [/* SharedObject dependencies will go here */],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
 ```

Believe it or not, we are now 90% of the way to having a visual Fluid component! Do not worry if it doesn't compile yet.
Let's take a quick summary of what we've written though before going the last bit to attain compilation.

```typescript
export class Clicker extends PrimedComponent
```

By extending the abstract `PrimedComponent` class, we have actually let it do a lot of the necessary set up work for us
through its constructor. Specifically, the `PrimedComponent` class gives us access to two items

- `root`: The `root` is a `SharedDirectory` [object](../docs/SharedDirectory.md) which, as the name implies, is a
  directory that is shared amongst all users that are rendering this component in the same session. Any items that are
  set here on a key will be accessible to other users using the same key on their respective client's root. The stored
  values can be primitives or the handles of other `SharedObject` items. If you don't know what handles are, don't
  worry! We'll take a look at them in the next section.

- `runtime`: The `runtime` is a `ComponentRuntime` object that manages the Fluid component lifecycle. The key thing to
  note here is that it will be used for the creation of other Fluid components and DDS'.

```typescript
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [/* SharedObject dependencies will go here */],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
```
These two lines in combination allow the Clicker component to be consumed as a Fluid component. While the first two
parameters that `PrimedComponentFactory` takes in simply define `Clicker`'s name and pass the class itself, the third
parameter is important to keep in mind for later as it will list the Fluid DDS' (Distributed Data Structures) that
`Clicker` utilizes.

Finally, the last line consisting of an exported `fluidExport` variable is what Fluid containers look for in order to
instantiate this component using the factory it provides.

Awesome, now that we're up to speed with our code scaffolding, let's add the actual counter data structure that we will
use to keep track of multiple users clicking the button, and a rudimentary render function. Following that, we will link
the two together.

### Adding a SharedObject and a Basic View

```typescript
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

const ClickerName = "Clicker";

export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    public render(elm: HTMLElement) {
        ReactDOM.render(
            <div />,
            elm,
        );
        return elm;
    }
}

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory()],
    {},
);

export const fluidExport = ClickerInstantiationFactory;

```

Now, our clicker has a `SharedCounter` available, which is an extension of `SharedObject` and can provide a simple empty
view. Although a little light on functionality, by just adding those few lines, our `Clicker` is now a compiling, visual
component! We will add in our business logic in a second but first, let's see what these few lines achieved.

As discussed above, the `PrimedComponent` already gives us a `SharedObject` in the form of the `SharedDirectory` root.
Any primitive we set to a key of the root, i.e. `root.set("key", 1)`, can be fetched by another user, i.e.
`root.get("key")` will return 1. However, different `SharedObject` classes have different ways of dictating merge logic,
so you should pick the one that best suits your needs given the scenario.

Although we can simply set a number on the `root` and increment it on `Clicker` clicks, we will use a `SharedCounter`
[object](../docs/SharedCounter.md#creation) instead, as it handles scenarios where multiple users click at the same
time. We add that `SharedObject` to our `Clicker` by passing it as the third dependency in the factory constructor. We
only need to add it to this list once, even if we use multiple `SharedCounter` instances.

```typescript
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
```

We will also be displaying our `Clicker` incrementing in a view, so we also need to mark our component as an
`IComponentHTMLView` component to say that it provides a render function, as explained at the beginning of this page.
This is done by adding the adding the `IComponentHTMLView` interface and implementing the first mandatory function,
`IComponentHTMLView`, by returning itself.

```typescript
export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }
}
```

We then implement the second mandatory function, `render(elm: HTMLElement)`, by calling the `ReactDOM.render` function and returning an empty div for now.

```typescript
public render(elm: HTMLElement) {
    ReactDOM.render(
        <div />,
        elm,
    );
    return elm;
}
```

Now that we can start using the SharedCounter DDS and have labeled this component as one that provides a view, we can start filling out the view itself and how it updates to changes in DDS'.

### Setting Up The Counter

Now that we have all of our scaffolding ready, we can actually start adding in the logic of creating an instance of the
`SharedCounter` object. Let's take a look at what this entails.

```typescript
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

const ClickerName = "Clicker";
const counterKey = "counter";

export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private _counter: SharedCounter | undefined;

    protected async componentInitializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(counterKey, counter.handle);
    }

    protected async componentHasInitialized() {
        const counterHandle = this.root.get<IComponentHandle<SharedCounter>>(counterKey);
        this._counter = await counterHandle.get();
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div />,
            div,
        );
        return div;
    }
}

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory()],
    {},
);

export const fluidExport = ClickerInstantiationFactory;
```

A good way of understanding what is happening here is thinking about the two different scenarios this component will be rendered in.

- This is the first time this component is being rendered in this session for any user, i.e. some user opened this
  `Clicker` session for the first time
- This is another user who is joining an existing session and is rendering a component with data that has already been
  updated, i.e. somebody clicked the `Clicker` a number of times already and now a new user enters to see the already
  incremented value

To cater to these two scenarios, the Fluid component lifecycle provides three different functions:

- `componentInitializingFirstTime` - This code will be run by clients in the first, new session scenario
- `componentInitializingFromExisting` - This code will be run by clients in the second, existing session scenario
- `componentHasInitialized` - This code will be run by clients in both the new and existing session scenarios

These all run prior to the first time `render` is called and can be async. As such, this is the perfect place to do any
setup work, such as assembling any DDS' you will need.

With this knowledge, let's examine what Clicker is doing with these functions.

```typescript
private _counter: SharedCounter | undefined;

protected async componentInitializingFirstTime() {
    const counter = SharedCounter.create(this.runtime);
    this.root.set(counterKey, counter.handle);
}
```

Since this is the first time this component has been rendered in this session, we need to add a `SharedCounter` to
everyone's shared `root` so we can all increment on the same object. We do this using the `SharedCounter.create`
function that simply takes in the `runtime` object that we have handy from the `PrimedComponent` class we inherited
earlier.

This now gives us an instance of `SharedCounter` to play with and set to our class. If you try to inspect it, you will
see that it has a list of functions including `value` and `increment` that we will use later.

However, it's not enough to just get an instance of `SharedCounter` ourselves! We need to make sure that any other
client that renders this also gets the same `SharedCounter`. Well, we know that we all share the same `root`, so we can
simply set it on a key there.

While `counter` itself cannot be directly stored, it provides a `counter.handle` that can be. We store it in the root
under a key string `counterKey` using

```typescript
this.root.set(counterKey, counter.handle);
```

So, this will ensure that there is always a `Counter` handle available in the root under that key. Now, let's take a
look at how to fetch it.

```typescript
protected async componentHasInitialized() {
    const counterHandle = this.root.get<IComponentHandle<SharedCounter>>(counterKey);
    this._counter = await counterHandle.get();
}
```

As we can see here, every client, whether its the first one or one joining an existing session will try to fetch a
handle from the `root` by looking under the `counterKey` key. Simply calling `await counterHandle.get()` now will give
us an instance of the same `SharedCounter` we had set in `componentInitializingFirstTime`.

In a nutshell, this means that `this._counter` is the same instance of `SharedCounter` for all of the clients that share
the same `root`.

### Creating the view

Alright, now for the moment you've been waiting for, connecting the counter to the view.

##### Final code

```typescript
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

const ClickerName = "Clicker";
const counterKey = "counter";

export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private _counter: SharedCounter | undefined;

    protected async componentInitializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(counterKey, counter.handle);
    }

    protected async componentHasInitialized() {
        const counterHandle = this.root.get<IComponentHandle<SharedCounter>>(counterKey);
        this._counter = await counterHandle.get();
    }

    public render(div: HTMLElement) {
        if (this._counter === undefined) {
            throw new Error("SharedCounter not initialized");
        }
        ReactDOM.render(
            <CounterReactView counter={this._counter} />,
            div,
        );
        return div;
    }
}

interface CounterProps {
    counter: SharedCounter;
}

interface CounterState {
    value: number;
}

class CounterReactView extends React.Component<CounterProps, CounterState> {
    constructor(props: CounterProps) {
        super(props);

        this.state = {
            value: this.props.counter.value,
        };
    }

    render() {
        return (
            <div>
                <span>
                    {this.state.value}
                </span>
                <button onClick={() => { this.props.counter.increment(1); }}>+</button>
            </div>
        );
    }

    componentDidMount() {
        this.props.counter.on("incremented", (incrementValue: number, currentValue: number) => {
            this.setState({ value: currentValue });
        });
    }
}

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory()],
    {},
);

export const fluidExport = ClickerInstantiationFactory;
```

Let's walk through the changes here. First off, we have our new `render` function that actually supplies a useful value
now instead of an empty `div`.

```typescript
public render(div: HTMLElement) {
    if (this._counter === undefined) {
        throw new Error("SharedCounter not initialized");
    }
    ReactDOM.render(
        <CounterReactView counter={this._counter} />,
        div,
    );
    return div;
}
```

By the time any client reaches the render function, they should have either created a `SharedCounter` and fetched it
from the root, or fetched an existing one from the root. As such, we will error if it's not available. Then we pass the
counter as a prop to our new React component `CounterReactView` inside `ReactDOM.render`. This will be your main entry
point into the React view lifecycle. Let's take a look at the `CounterReactView` component next.

```typescript
interface CounterProps {
    counter: SharedCounter;
}

interface CounterState {
    value: number;
}

class CounterReactView extends React.Component<CounterProps, CounterState> {
    constructor(props: CounterProps) {
        super(props);

        this.state = {
            value: this.props.counter.value,
        };
    }
}
```

Here we can see that the `CounterReactView` takes in a `SharedCounter` as a prop and sets its initial state to its
value. This means that if one client incremented the `SharedCounter` four times from 0 to 4, the new client will see 4
on its first render and continue incrementing from there. We'll examine the render next.

```typescript
render() {
    return (
        <div>
            <span>
                {this.state.value}
            </span>
            <button onClick={() => { this.props.counter.increment(1); }}>+</button>
        </div>
    );
}
```

This has two interesting sections:

- `this.state.value` - This is where we render the value that we set in our state in the constructor
- `this.props.counter.increment` - When the user presses the + button, it increments the SharedCounter object passed in
  the props

Now, the portion you will have noticed is missing is where the update on the `props.counter` translates to a
`state.value` update. This happens in the event listener we set up in `componentDidMount`.

```typescript
componentDidMount() {
    this.props.counter.on("incremented", (incrementValue: number, currentValue: number) => {
        this.setState({ value: currentValue });
    });
}
```

When we fire the `counter.increment` function, the `SharedCounter` emits a `"incremented"` event on all instances of it,
i.e. any client that is rendering it will receive this. The event carries the new counter value, and the callback simply
sets that value to the `state`. And there you have it! A synced counter! Any users who are rendering this `Clicker` will
be able to increment the counter together, and they can refresh their page and see that their count is persistent.

While this may seem trivial, the patterns of listening to events emitted on DDS updates can be extended to any
`SharedObject` including [SharedString](../docs/SharedString.md), [SharedMap](../docs/SharedMap.md), etc. These can then
be hooked up to different React views, and UI callbacks on these views can then be piped into actions on Fluid DDS'.

### OPTION B: React views

::: warning

The following code uses dependencies that are currently under development and may be unstable.

:::

In the following example, we will see how we can use `SyncedComponent` and Fluid's own custom React hooks to build our `Clicker` with a functional view in less than 50 lines of total code!

### Setting Up the Fluid Component

Before we write our view, we first need to build the Fluid object, `SyncedComponent`, where the view will be rendered in. If you read through Part A, you will see that many of the additional steps, such as the component lifecycle methods, handle management, and event listening, that we needed to write before reaching our view render will now be abstracted.

Below is the initial code to get you started; we will incrementally build on this throughout the example. The final result of this file is sufficient to produce a standalone component, and can be supplied as the `main` script in your component `package.json`.

Alright, lets take a look at some initial scaffolding.

```typescript
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent } from "@fluidframework/react";
export class ClickerWithHook extends SyncedComponent {
}

export const ClickerWithHookInstantiationFactory = new PrimedComponentFactory(
    "clicker-with-hook",
    ClickerWithHook,
    [/* SharedObject dependencies will go here */],
    {},
);
export const fluidExport = ClickerWithHookInstantiationFactory;
```

This will be pretty much all of the scaffolding you will need before writing your view! And we're already compiling!
Let's take a quick summary of what we've written though before adding our DDS and rendering our view.


```typescript
export class ClickerWithHook extends SyncedComponent
```

By extending the abstract `SyncedComponent` class, we have actually let it do a lot of the necessary set up work for us through its constructor. We will see how we can start adding synced states in its constructor for our views in the next section. The `SyncedComponent` also provides the `render(div: HTMLElement)` function to render our view in and automatically implements the `IComponentHTMLView` interface.

```typescript
export const ClickerWithHookInstantiationFactory = new PrimedComponentFactory(
    "clicker-with-hook",
    ClickerWithHook,
    [/* SharedObject dependencies will go here */],
    {},
);
export const fluidExport = ClickerWithHookInstantiationFactory;
```
These two lines in combination allow the Clicker component to be consumed as a Fluid component. While the first two
parameters that `PrimedComponentFactory` takes in simply define `Clicker`'s name and pass the class itself, the third
parameter is important to keep in mind for later as it will list the Fluid DDS' (Distributed Data Structures) that
`Clicker` utilizes.

For those that read Option A, `SyncedComponent` is a child class of `PrimedComponent` that is targeted specifically for synced views, so we can use the same factory here. The component lifecycle methods of the latter are also still available but their use is automatically handled for you in most scenarios.

Finally, the last line consisting of an exported `fluidExport` variable is what Fluid containers look for in order to instantiate this component using the factory it provides.

Awesome, now that we're up to speed with our code scaffolding, let's add the actual counter data structure that we will use to keep track of multiple users clicking the button, and a rudimentary render function. Following that, we will link the two together.


### Setting Up The Counter

Now that we have all of our scaffolding ready, we can actually start adding in the logic to set up our synced counter that will track the number of times users have clicked the button. We'll also render an empty view for now, and then connect the counter to the view in the next section. Let's take a look at what this first part entails.

```typescript
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent, setSyncedCounterConfig } from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import ReactDOM from "react-dom";
import React from "react";
export class ClickerWithHook extends SyncedComponent {
    constructor(props) {
        super(props);
        setSyncedCounterConfig(this, "counter-with-hook");
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div/>,
            div,
        );
        return div;
    }
}

export const ClickerWithHookInstantiationFactory = new PrimedComponentFactory(
    "clicker-with-hook",
    ClickerWithHook,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHookInstantiationFactory;
```

Three pieces of logic were added here:
- `setSyncedCounterConfig(this, "counter-with-hook")` - This prepares a synced counter for our view to use. It will be set on the ID `counter-with-hook`, which we will use later in our view to refer back to this counter. For each separate counter state that we want to track in our view, we need to call this helper function with a unique ID. There are similar helper functions for different types of synced states such as `setSyncedStringConfig`, `setSyncedArrayConfig<T>`, and a generic `setSyncedObjectConfig<T>` which you can use depending on the type of data your view needs synced.
- `render(div: HTMLElement)` - This function provides a `div` that we can easily pass to `ReactDOM.render` to begin rendering our view! We will just show an empty `div` for now but this is where our React application will go.
- `[SharedCounter.getFactory()]` - This line was added to the factory to let it know that this component requires the SharedCounter DDS that will be powering our synced counter. This only needs to be added once for each type of DDS that we need. i.e. if we wanted to add another counter, we do not need to add this line again. However, if we wanted to add a synced string with `setSyncedStringConfig`, we need to add `SharedString.getFactory()` to this array. Using `setSyncedObjectConfig<T>` does not require any added DDS dependencies here since the SharedMap that powers it is provided by default.


### Writing the view

And that's it for our setup! We can now write our view!

If you read through Option A, you will see that the Fluid React libraries will
now handle much of the event-listening logic that we had to write with `PrimedComponent`.

```typescript
interface ICounterReactHookProps {
    syncedComponent: SyncedComponent
}

function CounterWithHook(props: ICounterReactHookProps) {
    const [value, reducer] = useSyncedCounter(props.syncedComponent, "counter-with-hook");
    return (
        <div>
            <span className="value">
                {value}
            </span>
            <button onClick={() => reducer.increment(1)}>
                +
            </button>
        </div>
    );
}
```

Let's walk through this in parts:
```typescript
interface ICounterReactHookProps {
    syncedComponent: SyncedComponent
}
```
These props are how the view is linked to the counter we set up on our `SyncedComponent`. Here we see it passed in directly as a prop since this is a small, tutorial example but this can also be passed through React contexts in larger scale applications.

```typescript
function CounterWithHook(props: ICounterReactHookProps)
```
Our view is written here as a functional component since we are using Fluid hooks. This can also be written as a class-based component using the `FluidReactComponent` import.

```typescript
const [value, reducer] = useSyncedCounter(props.syncedComponent, "counter-with-hook");
```
The `useSyncedCounter` hook, provided from the `@fluidframework/react` package, allows us to retrieve our counter that we stored in our parent `SyncedComponent` under the ID `counter-with-hook`. Each of the setXConfig helper functions have their own corresponding hook, i.e. `useSyncedString`, `useSyncedArray<T>`, `useSyncedObject<T>`, etc. can be found in `@fluidframework/react`.

*It is important to pick the correct hook for your data's purposes as they are powered by different DDS' which provide unique syncing logic.*

 While it may be tempting to use `useSyncedObject<T>` for everything, it is setting an arbitrary `T` primitive or object on a SharedMap. As such, if we store a number to track our counter using `useSyncedObject<number>`, it will correctly set the new numbers on a map but it will not know how to handle the scenario where two people both try to increment at *exactly* the same time. For example, if the counter was at 0, it will try to set the value to 1 for both users on their SharedMap. What we actually want though if for both users to cause the counter to increment, which should result in a value of 2. This is why we use `useSyncedCounter` here instead, as SharedCounter is the DDS that knows how to handle the logic for simultaneous increments of the counter. Similarly, `useSyncedString` knows how to handle multiple people typing concurrently and can be easily rendered using `CollaborativeInput` or `CollaborativeTextArea`. Please see the [LikesAndComments example](../../components/experimental/likes-and-comments/README.md) to see how to use multiple different DDS hooks together with local React state.

Here, our `useSyncedCounter` hook returns to us the value of the `SharedCounter` powering it and a reducer of functions to interact with, containing the increment function we need.

And now, all that's left is to render our clicker!

```typescript
<div>
    <span className="value">
        {value}
    </span>
    <button onClick={() => reducer.increment(1)}>
        +
    </button>
</div>
```

This will render the `value` in the span label and automatically increment that value when the user presses the `+` button.

And we're done! Let's just put everything together.

### Final Code

```typescript
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent, setSyncedCounterConfig, useSyncedCounter } from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";
import * as ReactDOM from "react-dom";

interface ICounterReactHookProps {
    syncedComponent: SyncedComponent
}

function CounterWithHook(props: ICounterReactHookProps) {
    const [value, reducer] = useSyncedCounter(props.syncedComponent, "counter-with-hook");
    return (
        <div>
            <span className="value">
                {value}
            </span>
            <button onClick={() => reducer.increment(1)}>
                +
            </button>
        </div>
    );
}

export class ClickerWithHook extends SyncedComponent {
    constructor(props) {
        super(props);
        setSyncedCounterConfig(this, "counter-with-hook");
    }
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterWithHook
                    syncedComponent={this}
                />
            </div>,
            div,
        );
        return div;
    }
}
export const ClickerWithHookInstantiationFactory = new PrimedComponentFactory(
    "clicker-with-hook",
    ClickerWithHook,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHookInstantiationFactory;
```

All we did here was render our new functional view in the `render` function of our parent SyncedComponent. And, as promised, we have a Clicker with a view powered by a SharedCounter DDS in less than 50 lines!

### Takeaways

A good way to think about `SyncedComponent` is as the data store for your synced React view powered by Fluid. All DDS' that will power your views will live here and can be easily set using the `setSyncedXConfig` helper functions that are available. Alternatively, you can also set your own custom configurations by calling `this.setFluidConfig`. Please see the [clicker-reducer example](../../components/experimental/clicker-react/clicker-reducer/README.md) to see how to build your own custom schema definitions and use them with the `useReducerFluid` hook. Fluid also provides a synced corrollary to the`React.useState` hook with the `useStateFluid` hook, that you can also pair with your own schema configurations for simpler applications that do not necessarily need reducers. Please see the [clicker-functional example](../../components/experimental/clicker-react/clicker-functional/README.md) to see how that can be done. The DDS-specific hooks simply provide wrappers around these, allowing you to easily start using DDS' by automatically configuring your `SyncedComponent` using pre-set mappings. Finally, if you would like to use class-based React views, please see the  [clicker-react example](../../components/experimental/clicker-react/clicker-react/README.md) to see how to use the `FluidReactComponent` class, which provides a synced `state` and `setState` for your view to use.
