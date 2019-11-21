---
uid: yo-fluid-details
---

# Yo Fluid Breakdown

So you've used <xref:yo-fluid> to create your first component! If you haven't done this yet, head over to <xref:yo-fluid>.

## Creation options

<xref:yo-fluid> allows you to create a Fluid component either using React or just vanilla Javascript.

```powershell
? Which experience would you like to start with?
> react
  vanillaJS
```

You'll also get the option to customize your container. If this is your first time building a component, we recommend
choosing "no" for this option (we'll explain this option further below).

```powershell
? Do you want to customize your container (advanced)?
> no
  yes
```

## main.tsx/main.ts

After completing the prompts, `yo fluid` will generate your project. `src/main.ts*` file is where the component logic lives.
Below we will walk through both the vanillaJS and the React examples.

### Declare Imports

First we will declare all our imports. Here is a quick description and use cases for each is discussed further below.

`PrimedComponent` and `PrimedComponentFactory` from <xref:@microsoft/fluid-aqueduct!> provides helper functionality.
`IComponentHTMLVisual` from <xref:@microsoft/fluid-component-core-interfaces!> provides the interface for enabling rendering.
`React` and `ReactDOM` are _only for React_ and enable React use.

```typescript
import {
  PrimedComponent,
  PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react"; // only used with react
import * as ReactDOM from "react-dom"; // only used with react
```

### Define our Component Class

Below we define our component class `ExampleFluidComponent`.

#### <xref:@microsoft/fluid-aqueduct!PrimedComponent:class>

Extending <xref:@microsoft/fluid-aqueduct!PrimedComponent:class> set up our component with required default behavior as well as additional
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

#### <xref:@microsoft/fluid-component-core-interfaces!IComponentHTMLVisual:interface>

Implementing <xref:@microsoft/fluid-component-core-interfaces!IComponentHTMLVisual:interface> denotes that our component can
render a view. Throughout the Fluid Framework we define interfaces as a way to state our behavior. Whoever is attempting
to use this component can can know we support this interface and therefore it will have a `render(...)` function. View
rendering is explained more below.

#### Code

```typescript
export class ExampleFluidComponent extends PrimedComponent
  implements IComponentHTMLVisual {
  // ...
}
```

We also must implement our interface provider. As described above our component is viewable so it implements
`IComponentHTMLViewable`. By returning the component when this interface is queried, anyone who has a reference to
our component can discover that we implement `IComponentHTMLViewable`.

```typescript
public get IComponentHTMLVisual() { return this; }
```

### `componentInitializingFirstTime()`

`componentInitializingFirstTime()` will be called only the first time a client opens the component. In here we
perform setup operations that we only want to happen once.  Since we are using a `PrimedComponent`, we have a `root`
SharedDirectory we can use to store data. We set our initial `diceValue` on our root directory
`this.root.set("diceValue", 1);`

```typescript
protected async componentInitializingFirstTime() {
  this.root.set("diceValue", 1);
}
```

### `render(div: HTMLElement)`

`render(div: HTMLElement)` is the implementation of `IComponentHTMLVisual`. The caller provides an `HTMLElement` that the
Component can use to render into. Every time `render(...)` is called we should produce a new view.

> [!NOTE]
> This is the point where React and vanillaJS differ.

#### [React Implementation](#tab/tabid-1)
We create a `rerender` function that will display our content into the provided `HTMLElement`.
To get the dice value we use the `get` method on the root, using the same key `diceValue` that
we created in `componentInitializingFirstTime()`. Because we are using React we will call
`ReactDOM.render(...)` with a span displaying our dice value as a Unicode character and a button
that rolls the dice when clicked. Finally we pass the provided `HTMLElement`(`div`) into our
`ReactDOM.render(...)` to tell React what to render in.

Once we've created our function we call it once to render the first time.

```jsx
const rerender = () => {
  // Get our dice value stored in the root.
  const diceValue = this.root.get<number>("diceValue");

  ReactDOM.render(
    <div>
      <span style={{fontSize: 50}}>{this.getDiceChar(diceValue)}</span>
      <button onClick={this.rollDice.bind(this)}>Roll</button>
    </div>,
    div
  );
};

rerender();
```

Finally we add a listener so when the value of the dice changes we will trigger a render.

```typescript
this.root.on("valueChanged", () => {
  rerender();
});
```

To set the value of the dice after rolling, we use the `set` method on the root, using the same
key `diceValue` as before.  The helper functions used look like this:

```typescript
private rollDice() {
  const rollValue = Math.floor(Math.random() * 6) + 1;
  this.root.set("diceValue", rollValue);
}

private getDiceChar(value: number) {
  // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
  return String.fromCodePoint(0x267F + value);
}
```

#### [VanillaJS Implementation](#tab/tabid-2)

The VanillaJS implementation is similar in many ways to the React version.

We create our component's DOM structure in `this.createComponentDom(div);` which creates the span that
holds the dice value `diceSpan.textContent = this.getDiceChar(diceValue);`and the button that when clicked
rolls the dice `rollButton.onclick = this.rollDice.bind(this);`.

```typescript
private createComponentDom(host: HTMLElement) {
  const diceValue = this.root.get<number>("diceValue");

  const diceSpan = document.createElement("span");
  diceSpan.id = "diceSpan";
  diceSpan.style.fontSize = "50px";
  diceSpan.textContent = this.getDiceChar(diceValue);
  host.appendChild(diceSpan);

  const rollButton = document.createElement("button");
  rollButton.id = "rollButton";
  rollButton.textContent = "Roll";
  rollButton.onclick = this.rollDice.bind(this);
  host.appendChild(rollButton);
}
```

And we register our function to re-render when the value of the dice changes.

```typescript
this.root.on("valueChanged", () => {
  const diceValue = this.root.get<number>("diceValue");
  const diceSpan = document.getElementById("diceSpan");
  diceSpan.textContent = this.getDiceChar(diceValue);
});
```

***

### Component Instantiation

In order to make our component compatible with the Fluid Framework we must have a way of creating a
new instance. We require having an instantiation factory because it's required to define all supported
distributed data structures up front. Defining all the DDSs up front allows for the Fluid Framework to load
from a snapshot without worrying that something might exist in the snapshot that the framework can't understand.

In the example below we use the <xref:@microsoft/fluid-aqueduct!PrimedComponentFactory:class> as a helper to create our
instantiation factory. As properties we pass in our supported distributed data structures. In this scenario we don't use
any additional distributed data structures, so we pass an empty array.

```typescript
[],
```

The second property is an entry point into our component.

```typescript
ExampleFluidComponent.load;
```

Finally we export this as `fluidExport`.  This export is special - the `@microsoft/fluid-webpack-component-loader` we
are using to load our component knows to look for this particular export to load from.

```typescript
export const fluidExport = new PrimedComponentFactory(
  ExampleFluidComponent,
  [],
);
```

## Custom container

If you instead chose to customize your container during the `yo fluid` setup, a couple things change.

### Factory export

Instead of exporting the `PrimedComponentFactory` directly as the `fluidExport`, we'll instead export this factory
for use in the container we're customizing (in [index.ts](#index.ts)).

```typescript
export const ExampleFluidComponentInstantiationFactory = new PrimedComponentFactory(
  ExampleFluidComponent,
  []
);
```

<a name="index.ts" />

### `index.ts`

You'll also have a file `./src/index.ts` for the container.  In this file we define a registry of supported components.
This is represented as a `Map<string, IComponentFactory>`. In our scenario we only have one component and therefore
one factory.

We import our `ExampleFluidComponentInstantiationFactory` from our `./main`:

```typescript
import { ExampleFluidComponentInstantiationFactory } from "./main";
```

We import the `package.json` and use the package name as our component name. It's required when creating a new component
to provide this name.

```typescript
const pkg = require("../package.json");
const componentName = pkg.name as string;
```

Finally we use `SimpleModuleInstantiationFactory` to create the `fluidExport`. The factory takes a default component
name `componentName` that is used to load the default component. It also takes the registry of components pointing to
the creation factory. In our case just our one component.

`[componentName, Promise.resolve(ExampleFluidComponentInstantiationFactory)]`

```typescript
export const fluidExport = new SimpleModuleInstantiationFactory(
  componentName,
  new Map([
    [componentName, Promise.resolve(ExampleFluidComponentInstantiationFactory)],
  ])
);
```
