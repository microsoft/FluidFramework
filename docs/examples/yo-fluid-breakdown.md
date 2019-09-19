---
uid: yo-fluid-details
---

# Yo Fluid Breakdown

> [!WARNING]
> This documentation is based on an earlier version of the Fluid Framework and is outdated.
>
> Track the documentation update with [#3499](https://github.com/microsoft/Prague/issues/3499).

So you've used <xref:yo-fluid> to create your first component! If you haven't done this yet, head over to <xref:yo-fluid>.

## Different Components

<xref:yo-fluid> allows you to create two types of Fluid components:

- react
- vanillaJS

When running <xref:yo-fluid> you can choose which one to use when prompted.

```powershell
? Which experience would you like to start with?
> react
  vanillaJS
```

The difference between the two is how we render our view in the DOM. (Discussed below)

## Directory Structure Breakdown

Upon creation your directory structure will look like this:

### [React Directory Structure](#tab/tabid-1)

```text
├── node_modules
├─┬ src
│ ├── index.ts
│ └── main.tsx
├── .gitignore
├── .npmignore
├── .npmrc
├── package-lock.json
├── package.json
├── README.md
├── tsconfig.json
├── webpack.config.js
├── webpack.dev.js
└── webpack.prod.js
```

### [VanillaJS Directory Structure](#tab/tabid-2)

```text
├── node_modules
├─┬ src
│ ├── index.ts
│ └── main.ts
├── .gitignore
├── .npmignore
├── .npmrc
├── package-lock.json
├── package.json
├── README.md
├── tsconfig.json
├── webpack.config.js
├── webpack.dev.js
└── webpack.prod.js
```

*******

## Main.tsx/Main.ts

The `src/main.ts*` file is where the component logic lives. Below we will walk through both the vanillaJS and the React examples.

### Declare Imports

First we will declare all our imports. Here is a quick description and use cases for each is discussed further below.

`PrimedComponent` and `PrimedComponentFactory` from <xref:@prague/aqueduct!> provides helper functionality.
`IComponentHTMLVisual` from <xref:@prague/component-core-interfaces!> provides the interface for enabling rendering.
`CounterValueType` from <xref:@microsoft/fluid-map!> is a Value Type we'll use in our root Distributed Data Structure (more on that later).
`IComponentContext` and `IComponentRuntime` are the interfaces for important fluid objects passed to our Component.
`React` and `ReactDOM` are *only for React* and enable React use.

```typescript
import {
  PrimedComponent,
  PrimedComponentFactory,
} from "@prague/aqueduct";
import {
  IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import {
  CounterValueType,
} from "@microsoft/fluid-map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";

import * as React from "react"; // only used with react
import * as ReactDOM from "react-dom"; // only used with react
```

### Define our Component Class

Below we define our component class `ExampleFluidComponent`.

#### <xref:@prague/aqueduct!PrimedComponent:class>

Extending <xref:@prague/aqueduct!PrimedComponent:class> set up our component with required default behavior as well as additional
helpers to make development easier.

#### Key Benefits

1. Setup a `root` SharedDirectory (a Distributed Data Structure) that we can use to store collaborative content and other
distributed data structures.
2. Provide `this.createAndAttachComponent(...)` and `this.getComponent(...)` functions for easier creation and access
to other components.
3. Provide the following setup overrides
    - `componentInitializingFirstTime()` - only called the first time a component is initialized
    - `existing()` - called every time except the first time a component is initialized
    - `opened()` - called every time a component is initialized. After `create` and `existing`.

#### <xref:@prague/component-core-interfaces!IComponentHTMLVisual:interface>

Implementing <xref:@prague/component-core-interfaces!IComponentHTMLVisual:interface> denotes that our component can
render a view. Throughout the Fluid Framework we define interfaces as a way to state our behavior. Whoever is attempting
to use this component can can know we support this interface and therefor we will have a `render(...)` function. View
rendering is explained more below.

#### Code

```typescript
export class ExampleFluidComponent extends PrimedComponent implements IComponentHTMLVisual {
    // ...
}
```

### `load(...)` and `componentInitializingFirstTime()`

The `public static async load(runtime: IComponentRuntime, context: IComponentContext){...}` function is the entry point
to creating an instance of our `ExampleFluidComponent`. We require using a `static async` load function instead of simply
creating an instance of the component because we could be required to perform `async` actions as a part of load.

Within the load function we create a new instance of our component passing through the `IComponentRuntime` and the
`IComponentContext`. Having the `runtime` and `context` allow our component to perform actions against Fluid Framework.
Example actions include creating/modifying distributed data structures as well as creating/getting other components.

We also pass through our `supportedInterface`. As described above our component is viewable so it implements
`IComponentHTMLViewable`. By passing through this as a supported interface anyone who has a reference to our component
can discover that we implement `IComponentHTMLViewable`.

Next we call, and `await`, `initialize()` on our newly created component instance. `initialize()` is a method on the
<xref:@prague/aqueduct!SharedComponent:class> that properly calls the three override methods discussed above, `componentInitializingFirstTime()`, `existing()`,
and `opened()`. We want to `await` this call because it could perform asynchronous operations such as creating and/or getting
a component.

`componentInitializingFirstTime()` will be called only the first time the `initialize()` is called. In here we perform setup operations that we only
want to happen once. `await super.componentInitializingFirstTime()` calls the `componentInitializingFirstTime()` function on the `PrimedComponent`.
In here we create and set the `root` SharedDirectory. We need to call this first to ensure the root is available later. Next we create a new counter,
called `"clicks"` on our root directory `this.root.createValueType("clicks", CounterValueType.Name, 0);`

```typescript
private static readonly supportedInterfaces = ["IComponentHTMLVisual"];

/**
 * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first time your component
 * is created. Anything that happens in componentInitializingFirstTime will happen before any other user will see the component.
 */
protected async componentInitializingFirstTime() {
  // Calling super.componentInitializingFirstTime() creates a root SharedDirectory that you can work off.
  await super.componentInitializingFirstTime();
  this.root.createValueType("clicks", CounterValueType.Name, 0);
}

/**
 * Static load function that allows us to make async calls while creating our object.
 * This becomes the standard practice for creating components in the new world.
 * Using a static allows us to have async calls in class creation that you can't have in a constructor
 */
public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<ExampleFluidComponent> {
  const clicker = new ExampleFluidComponent(runtime, context, ExampleFluidComponent.supportedInterfaces);
  await clicker.initialize();

  return clicker;
}
```

### `render(div: HTMLElement)`

`render(div: HTMLElement)` is the implementation of `IComponentHTMLVisual`. The caller provides an `HTMLElement` that the
Component can use to render into. Every time `render(...)` is called we should return a new view.

> [!NOTE]
> This is the point where React and vanillaJS differ.

#### [React Implementation](#tab/tabid-3)

The first thing we do is get our `"clicks"` counter, created in `componentInitializingFirstTime()`.

```typescript
const counter = this.root.get("clicks");
```

Next we create a function that will display our content into the provided `HTMLElement`.
Because we are using React we will call `ReactDOM.render(...)` with a span displaying
our `counter.value` and a button that increments our counter by 1  when clicked `counter.increment(1)`.
Finally we pass the provided `HTMLElement`(`div`) into our `ReactDOM.render(...)` to tell React
what to render in.

Once we've created our function we call it once to render the first time.

```jsx
const rerender = () => {
    ReactDOM.render(
        <div>
        <span>{counter.value}</span>
        <button onClick={() => counter.increment(1)}>+</button>
        </div>,
        div
    );
};

rerender();
```

Finally we add a listener so when the value of the counter changes we will trigger a render.

```typescript
counter.on("incremented", () => {
    rerender();
});
return div;
```

Altogether the code looks like this:

```jsx
/**
 * Will return a new Clicker view
 */
public render(div: HTMLElement) {
  // Get our counter object that we set in initialize and pass it in to the view.
  const counter = this.root.get("clicks");

  const rerender = () => {
    ReactDOM.render(
      <div>
        <span>{counter.value}</span>
        <button onClick={() => counter.increment(1)}>+</button>
      </div>,
      div
    );
  };

  rerender();
  counter.on("incremented", () => {
    rerender();
  });
  return div;
}
```

#### [VanillaJS Implementation](#tab/tabid-4)

The VanillaJS implementation is similar in many ways to the React version. There is more
code because ReactDOM provides a lot of the inner element setup.

Here we get our counter

```typescript
const counter = this.root.get<Counter>("clicks");
```

Next we create our `reRender` function we will call when the counter is incremented.

```typescript
  const reRender = () => {
    const counterSpan = document.getElementById("counterSpan");
    counterSpan.textContent = counter.value.toString();
  };
```

Next we call `this.createComponentDom(div);` which creates the span that holds our value
`counterSpan.textContent = counter.value.toString();`and the button that when clicked increments 1
`counterButton.onclick = () => counter.increment(1);`.

```typescript
protected createComponentDom(host: HTMLElement) {
  const counter = this.root.get<Counter>("clicks");
  const counterSpan = document.createElement("span");
  counterSpan.id = "counterSpan";
  counterSpan.textContent = counter.value.toString();
  host.appendChild(counterSpan);

  const counterButton = document.createElement("button");
  counterButton.id = "counterButton";
  counterButton.textContent = "+";
  counterButton.onclick = () => counter.increment(1);
  host.appendChild(counterButton);
}
```

Finally we add a listener so when the value of the counter changes we will trigger a render.

```typescript
counter.on("incremented", () => {
    reRender();
  });
```

Altogether the code looks like this:

```typescript
/**
 * Will return a new Clicker view
 */
public render(div: HTMLElement) {
  const counter = this.root.get<Counter>("clicks");
  const reRender = () => {
    const counterSpan = document.getElementById("counterSpan");
    counterSpan.textContent = counter.value.toString();
  };

  this.createComponentDom(div);

  // When the value of the counter is incremented we will reRender
  counter.on("incremented", () => {
    reRender();
  });
}

protected createComponentDom(host: HTMLElement) {
  const counter = this.root.get<Counter>("clicks");
  const counterSpan = document.createElement("span");
  counterSpan.id = "counterSpan";
  counterSpan.textContent = counter.value.toString();
  host.appendChild(counterSpan);

  const counterButton = document.createElement("button");
  counterButton.id = "counterButton";
  counterButton.textContent = "+";
  counterButton.onclick = () => counter.increment(1);
  host.appendChild(counterButton);
}
```

*******

### Component Instantiation

In order to make our component compatible with the Fluid Framework we must have a way of creating a
new instance. We require having an instantiation factory because it's required to define all supported
distributed data structures up from. Defining all the DDSs up front allows for the Fluid Framework to load
from a snapshot without worrying that something might exist in the snapshot that the framework can't understand.

In the example below we use the <xref:@prague/aqueduct!PrimedComponentFactory:class> as a helper to create our
instantiation factory. As properties we pass in our supported distributed data structures.
In this scenario we don't use any additional distributed data structures, so we pass an empty array.

```typescript
[],
```

The second property is an entry point into our component.

```typescript
ExampleFluidComponent.load
```

Finally we export this so we can use it in the [index.ts](#index.ts) below for our component registry.

```typescript
/**
 * This is where you define all your Distributed Data Structures
 */
export const ExampleFluidComponentInstantiationFactory = new SharedComponentFactory(
  ExampleFluidComponent,
  [],
);
```

<a name="index.ts" />

## `index.ts`

In this file we define a registry of supported components. This is represented as a `Map<string,IComponentFactory>`. In
our scenario we only have one component and therefore one factory.

We import our `ExampleFluidComponentInstantiationFactory` from our `./main`

```typescript
import {
    ExampleFluidComponentInstantiationFactory,
} from "./main";
```

We import the `package.json` and use the package name as our component name. It's required when creating a new component
to provide this name.

```typescript
const pkg = require("../package.json");
const chaincodeName = pkg.name as string;
```

Finally we use `SimpleModuleInstantiationFactory` to create a `fluidExport`. The factory takes a default component name `chaincodeName`
that is used to load the default component. It also takes the registry of components pointing to the creation factory. In
our case just our one component. `[chaincodeName, Promise.resolve(ExampleFluidComponentInstantiationFactory)]`

```typescript
export const fluidExport = new SimpleModuleInstantiationFactory(
  chaincodeName,
  new Map([
      [chaincodeName, Promise.resolve(ExampleFluidComponentInstantiationFactory)],
  ]),
);
```

All together the code looks like this:

```typescript
import {
  SimpleModuleInstantiationFactory
} from "@prague/aqueduct";

import {
    ExampleFluidComponentInstantiationFactory,
} from "./main";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const chaincodeName = pkg.name as string;

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the
 * EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
  chaincodeName,
  new Map([
      [chaincodeName, Promise.resolve(ExampleFluidComponentInstantiationFactory)],
  ]),
);

```
