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

Over the course of this example, we will incrementally build out our entire component in one file. The final two
versions of the code can be found at the bottom of each section. Each of these files define an entire, self-sufficient
Fluid component that can be exported in its own package.

First, we will look at how `Clicker` is set up such that it defines itself as a Fluid Component and uses a shared state.
Then, we will take a look at two different ways of generating a view that responds to changes on that shared state when
a user presses a button:

- Option A: Using a robust, event-driven pattern that can be emulated for different view frameworks.
- Option B: Using a React adapter that React developers may find more familiar but uses experimental code that is still being developed.

## Setting Up the Fluid Component

Before we do either of the options, we first need to do some common steps to say that `Clicker` is a Fluid component,
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

## Adding a SharedObject and a Basic View

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

We then implement the second mandatory function, `render(elm: HTMLElement)`, by calling the `ReactDOM.render` function
and returning an empty div for now.

```typescript
public render(elm: HTMLElement) {
    ReactDOM.render(
        <div />,
        elm,
    );
    return elm;
}
```

Now that we can start using the SharedCounter DDS and have labeled this component as one that provides a view, we can
start filling out the view itself and how it updates to changes in DDS'.

## Creating the View

Now, we have two choices for crafting our view.

The recommended choice currently is to use event-driven views. This ties events that are fired on `SharedObject` changes
to trigger re-renders for any view framework. When using React, instead of needing to re-render, we can simply call
`setState` with the new value.

There is a also a new, experimental Fluid React library that React developers may find easier to use since it abstracts
much of the event-driven state update logic, but it is a still a WiP for scenarios such as cross-component relationships
and may be unstable. However, we can use it for standalone components such as this. It is still recommended to read the
event-driven case even if you choose to apply the Fluid React libraries to understand the logic that is happening
beneath the abstraction the libraries provide.

### OPTION A: Event-Driven Views

#### Setting Up The Counter

Now that we have all of our scaffolding ready, we can actually start adding in the logic of creating an instance of the
`SharedCounter` object. Let's take a look at what this entails.

```typescript
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { IFluidHandle} from "@fluidframework/component-core-interfaces";
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
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
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
    const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
    this._counter = await counterHandle.get();
}
```

As we can see here, every client, whether its the first one or one joining an existing session will try to fetch a
handle from the `root` by looking under the `counterKey` key. Simply calling `await counterHandle.get()` now will give
us an instance of the same `SharedCounter` we had set in `componentInitializingFirstTime`.

In a nutshell, this means that `this._counter` is the same instance of `SharedCounter` for all of the clients that share
the same `root`.

#### Creating the view

Alright, now for the moment you've been waiting for, connecting the counter to the view.

##### Final code

```typescript
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { IFluidHandle} from "@fluidframework/component-core-interfaces";
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
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
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

The following code uses dependencies that are very experimental and may be unstable.

:::

Now we are going to take the scaffolding that we set up earlier and add in our React libraries to tie our synced state
update to our local React state update. If you read through Option A, you will see that the Fluid React libraries will
now handle much of the event-listening logic that we wrote earlier.

##### Final code

```typescript
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    FluidReactComponent,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    FluidToViewMap,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

interface CounterState {
    counter?: SharedCounter;
}

type CounterViewState = IFluidFunctionalComponentViewState & CounterState;
type CounterFluidState = IFluidFunctionalComponentFluidState & CounterState;


export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    public render(element: HTMLElement) {
        const fluidToView: FluidToViewMap<CounterViewState, CounterFluidState> = new Map();
        fluidToView.set("counter", {
            sharedObjectCreate: SharedCounter.create,
            listenedEvents: ["incremented"],
        });

        ReactDOM.render(
            <CounterReactView
                syncedStateId={"clicker"}
                root={this.root}
                dataProps={{
                    fluidComponentMap: new Map(),
                    runtime: this.runtime,
                }}
                fluidToView={fluidToView}
            />,
            element,
        );
        return element;
    }
}

class CounterReactView extends FluidReactComponent<CounterViewState, CounterFluidState> {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.counter?.value}
                </span>
                <button onClick={() => { this.state.counter?.increment(1); }}>+</button>
            </div>
        );
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

Let's take this in parts to understand the link between the Fluid Component and the view that we establish here.

First, let's just take a look at the interfaces our view will be using.

```typescript
interface CounterState {
    counter?: SharedCounter;
}

type CounterViewState = IFluidFunctionalComponentViewState & CounterState;
type CounterFluidState = IFluidFunctionalComponentFluidState & CounterState;
```

The `CounterViewState` and `CounterFluidState` here both have the `counter` available. The former is what will be used
by our React views to render, whereas the latter is used for managing the synced state on our `root`. In the case of a
simple example like this, they are largely the same apart from extending from two different base classes provided by the
framework. They can be different in more involved examples where we want to abstract Fluid DDS objects out of the
interface consumed by our views, so that they can exist without requiring Fluid knowledge.

Now, let us break down the `render` function to see how the relationship between these two states is set.

```typescript
public render(element: HTMLElement) {
    const fluidToView: FluidToViewMap<CounterViewState, CounterFluidState> = new Map();
    fluidToView.set("counter", {
        sharedObjectCreate: SharedCounter.create,
        listenedEvents: ["incremented"],
    });

    ReactDOM.render(
        <CounterReactView
            syncedStateId={"clicker"}
            root={this.root}
            dataProps={{
                fluidComponentMap: new Map(),
                runtime: this.runtime,
            }}
            fluidToView={fluidToView}
        />,
        element,
    );
    return element;
}
```

Here, we construct a `fluidToView` mapping to describe the relationship between `counter` in the view state and
`counter` in the Fluid state. If this is the first time this component is being rendered, it will use the callback in
`sharedObjectCreate` to initialize the `SharedCounter` object on the synced state. Any returning clients will
automatically fetch this stored value, convert it from a handle to the component itself, and pass it into the view
state.

We also pass in the `listenedEvents` parameter to indicate which events on this Fluid state value should trigger a state
update. Here we pass in `"incremented"` as we want the view to refresh when the user increments.

This also optionally takes in `stateKey`, `viewConverter`, and `rootKey` parameters to handle cases where the view and
fluid states do not match, but they are not needed here.

If you read Option A above, you will notice that we no longer need to set up the `SharedCounter` in the component
lifecycle and that we only have the `render` function now. This is because this initialization is happening within the
React lifecycle, and the `SharedCounter` instance will be made available through a state update after it finishes
initializing. This is why you see that `CounterState` is defined as `{counter?: SharedCounter}` instead of `{counter:
SharedCounter}`. Prior to initialization, `state.counter` will return undefined.

Okay, now we have everything necessary to pass in as props to our `CounterReactView`.

- `syncedStateId` - This should be unique for each component that shares the same root, i.e. if there was another
  clicker being render alongside this one in this component, it should receive its own ID to prevent one from
  interfering in the updates of the other
- `root` - The same `SharedDirectory` provided by `this.root` from `PrimedComponent`
- `dataProps.fluidComponentMap` - This can just take a new `Map` instance for now but will need to be filled when
  establishing multi-component relationships in more complex cases. This map is where all the DDS' that we use are
  stored after being fetched from their handles, and it used to make the corresponding component synchronously available
  in the view.
- `dataProps.runtime` - The same `ComponentRuntime` provided by `this.runtime` from `PrimedComponent`
- `fluidToView` - The fluidToView relationship map we set up above.

We're ready to go through our view, which is now super simple due to the setup we did in the Fluid component itself.

```typescript
class CounterReactView extends FluidReactComponent<CounterViewState, CounterFluidState> {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.counter?.value}
                </span>
                <button onClick={() => { this.state.counter?.increment(1); }}>+</button>
            </div>
        );
    }
}
```

We can see that the state is initially empty as it only consists of the `SharedCounter` DDS, and we know the
`FluidReactComponent` will be handling the loading of that since we passed it as a key in the `fluidToView` map.

The view itself can now directly use the `this.state.counter.value` and we can update it by simply using
`this.state.counter.increment(1)`. This will directly update the `this.state.counter.value` without needing any event
listeners to be additionally set up. And there you have it, a synced clicker with persistent state without needing to
directly use IFluidHandles or set up event listeners!

We can extend this example to other DDS' by passing in their corresponding `create` functions in and listening to their
respective events.
