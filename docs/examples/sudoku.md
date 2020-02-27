---
title: "Sudoku"
uid: sudoku-example
---

In this example we will build a collaborative Sudoku game. We will use Fluid distributed data structures to store and
synchronize the Sudoku data.

[[toc]]

# Acknowledgements

This example uses the [sudokus](https://github.com/Moeriki/node-sudokus) NPM package by Dieter Luypaert
(<https://github.com/Moeriki>) and the [@types/sudokus](https://www.npmjs.com/package/@types/sudokus) package by Florian
Keller (<https://github.com/ffflorian>).

# Set up your dev environment

If you haven't already, [set up your Fluid Framework development
environment](../guide/README.md#set-up-your-development-environment).

First, clone the tutorial repository here:
   <https://dev.azure.com/FluidDeveloperProgram/Developer%20Preview/_git/fluid-sudoku-tutorial>.

Since the Git repository is authenticated, it is easiest to visit the URL above and click the "Clone" button in the
top-right corner of the UI. Follow the resulting instructions to clone the repo.

Once you've cloned the repo, run `npm install` in the root of the repository to install dependencies.

Finally, you can open the folder in Visual Studio Code.

## Folder layout

The project has the following folder layout:

```
└───src
    |   fluidSudoku.tsx
    │   index.ts
    ├───helpers
    │       coordinate.ts
    │       puzzles.ts
    |       styles.css
    │       sudokuCell.ts
    └───react
            sudokuView.tsx
```

The _src_ folder contains the source files for the Sudoku Fluid component.

## Run the sample

After you've cloned the sample repo and installed dependencies using `npm install`, you can then use `npm start` to start
a local dev environment for testing and debugging. Visit <http://localhost:8080/> in a browser to load the Fluid
development server, which will load two instances of the component side by side.

!!!include(../includes/browsers.md)!!!

<style>
  #sudoku {
    height: 500px;
    width: 910px;
  }
</style>

<iframe id="sudoku" src="/fluid/sudoku.html"></iframe>

::: important

If you make changes to your data model during development, you may notice console failures, or your component may fail
to load completely, when you refresh localhost:8080. This is caused when the local code tries to load a Fluid data model
that uses a schema different than what the code expects. You can force a fresh Fluid document, and by extension, an
empty schema, by reloading <http://localhost:8080/>. This will redirect you to a new random Fluid document.

:::

# Deep dive

## Data model

For our Sudoku data model, we will use a map-like data structure with string keys. Each key in the map is a coordinate
(row, column) of a cell in the Sudoku puzzle. The top left cell has coordinate `"0,0"`, the cell to its right has
coordinate `"0,1"`, etc.

Each value stored in the map is a `SudokuCell`, a simple class that contains the following properties:

```typescript
value: number // The current value in the cell; 0 denotes an empty cell
isCorrect: boolean = false // True if the value in the cell is correct
readonly fixed: boolean; // True if the value in the cell is supplied as part of the puzzle's "clues"
readonly correctValue: number // Stores the correct value of the cell
readonly coordinate: CoordinateString // The coordinate of the cell, as a comma-separated string, e.g. "2,3"
```

::: important

Objects that are stored in distributed data structures, as `SudokuCell` is, must be safely JSON-serializable. This means
that you cannot use functions or TypeScript class properties with these objects, because those are not JSON-serialized.

One pattern to address this is to define static functions that accept the object as a parameter and manipulate it. See
the `SudokuCell` class in `/src/helpers/sudokuCell.ts` for an example of this pattern.

:::

## Rendering

In order to render the Sudoku data, we use a React component called `SudokuView` This component is defined in
`src/react/sudokuView.tsx` and accepts the map of Sudoku cell data as a prop. It then renders the Sudoku and
accompanying UI.

The `SudokuView` React component is also responsible for handling UI interaction from the user; we'll examine that in
more detail later.

## The Fluid component

The React component described above does not itself represent a Fluid component. Rather, the Fluid component is defined
in `src/fluidSudoku.tsx`.

```typescript
export class FluidSudoku extends PrimedComponent
  implements IComponentHTMLVisual, IComponentReactViewable {}
```

This class extends the [PrimedComponent][] abstract base class. Our component is visual, so we need to implement the
[IComponentHTMLVisual][] or [IProvideComponentHTMLVisual][] interfaces. In our case, we want to handle rendering
ourselves rather than delegate it to another object, so we implement [IComponentHTMLVisual][].

Since we are using React, we also implement the [IComponentReactViewable][] interface. This will enable a Fluid host or
container to use this component both with and without React. A host using React will call the `createJSXElement` method
and use the JSX directly, while a non-React hot would just give the component a hosting element and let it render
itself.

### Implementing interfaces

#### IComponentReactViewable

[IComponentReactViewable][] requires us to implement a method that will return the JSX that represents the component.
The implementation is as follows:

```typescript
public createJSXElement(props?: any): JSX.Element {
    if (this.puzzle) {
        return (
            <SudokuView
                puzzle={this.puzzle}
                clientId={this.runtime.clientId}
            />
        );
    } else {
        return <div />;
    }
}
```

Notice that we pass the puzzle data, a `SharedMap` distributed data structure that we will discuss more below, to the
SudokuView React component as props.

#### IComponentHTMLVisual

[IComponentHTMLVisual][] requires us to implement the `render()` method, which is straightforward since we're using the
`SudokuView` React component to do the heavy lifting.

```typescript
public render(element?: HTMLElement): void {
    if (element) {
        this.domElement = element;
    }
    if (this.domElement) {
        ReactDOM.render(this.createJSXElement(), this.domElement);
    }
}
```

As you can see, the render method uses React to render the `SudokuView` React component.

### Creating Fluid distributed data structures

How does the `puzzle` property get populated? How are distributed data structures created and used?

To answer that question, look at the `componentInitializingFirstTime` method in the `FluidSudoku` class:

```typescript
private sudokuMapKey = "sudoku-map";
private puzzle: ISharedMap;

protected async componentInitializingFirstTime() {
    // Create a new map for our Sudoku data
    const map = SharedMap.create(this.runtime);

    // Populate it with some puzzle data
    loadPuzzle(0, map);

    // Store the new map under the sudokuMapKey key in the root SharedDirectory
    this.root.set(this.sudokuMapKey, map.handle);
}
```

This method is called once when a component is initially created. We create a new [SharedMap][] using `.create`,
registering it with the runtime. We have access to the Fluid runtime from `this.runtime` because we have subclassed
[PrimedComponent][].

Once the SharedMap is created, we populate it with puzzle data. Finally, we store the SharedMap we just created in the
`root` [SharedDirectory][]. The `root` [SharedDirectory][] is provided by [PrimedComponent][], and is a convenient place
to store all Fluid data used by your component.

Notice that we provide a string key, `this.sudokuMapKey`, when we store the `SharedMap`. This is how we will retrieve
the data structure from the root SharedDirectory later.

`componentInitializingFirstTime` is only called the _first time_ the component is created. This is exactly what we want
in order to create the distributed data structures. We don't want to create new SharedMaps every time a client loads the
component! However, we do need to _load_ the distributed data structures each time the component is loaded.

Distributed data structures are initialized asynchronously, so we need to retrieve them from within an asynchronous
method. We do that by overloading the `componentHasInitialized` method, then store a local reference to the object
(`this.puzzle`) so we can easily use it in synchronous code.

```typescript
protected async componentHasInitialized() {
    this.puzzle = await this.root.get<IComponentHandle>(this.sudokuMapKey).get<ISharedMap>();
}
```

The `componentHasInitialized` method is called once after the component has completed initialization, be it the first
time or subsequent times.

#### A note about component handles

You probably noticed some confusing code above. What are handles? Why do we store the SharedMap's _handle_ in the `root`
SharedDirectory instead of the SharedMap itself? The underlying reasons are beyond the scope of this example, but the
important thing to remember is this:

**When you store a distributed data structure within another distributed data structure, you store the _handle_ to the
DDS, not the DDS itself. Similarly, when loading a DDS that is stored within another DDS, you must first get the DDS
handle, then get the full DDS from the handle.**

```typescript
await this.root.get<IComponentHandle>(this.sudokuMapKey).get<ISharedMap>();
```

### Handling events from distributed data structures

Distributed data structures can be changed by both local code and remote clients. In the `componentHasInitialized`
method, we also connect a method to be called each time the Sudoku data - the [SharedMap][] - is changed. In our case we
simply call `render` again. This ensures that our UI updates whenever a remote client changes the Sudoku data.

```typescript
this.puzzle.on("valueChanged", (changed, local, op) => {
  this.render();
});
```

### Updating distributed data structures

In the previous step we showed how to use event listeners with distributed data structures to respond to remote data
changes. But how do we update the data based on _user_ input? To do that, we need to listen to some DOM events as users
enter data in the Sudoku cells. Since the `SudokuView` class handles the rendering, that's where the DOM events will be
handled.

Let's look at the `numericInput` function, which is called when the user keys in a number.

::: note

The `numericInput` function can be found in the `SimpleTable` React component within `src/react/sudokuView.tsx`.
`SimpleTable` is a helper React component that is not exported; you can consider it part of the `SudokuView` React
component.

:::

```typescript{2-6,9}
const numericInput = (keyString: string, coord: string) => {
  let valueToSet = Number(keyString);
  valueToSet = Number.isNaN(valueToSet) ? 0 : valueToSet;
  if (valueToSet >= 10 || valueToSet < 0) {
    return;
  }

  if (coord !== undefined) {
    const cellInputElement = getCellInputElement(coord);
    cellInputElement.value = keyString;

    const toSet = props.puzzle.get<SudokuCell>(coord);
    if (toSet.fixed) {
      return;
    }
    toSet.value = valueToSet;
    toSet.isCorrect = valueToSet === toSet.correctValue;
    props.puzzle.set(coord, toSet);
  }
};
```

Lines 2-6 ensure we only accept single-digit numeric values. In line 9, we retrieve the coordinate of the cell from a DOM
attribute that we added during render. Once we have the coordinate, which is a key in the `SharedMap` storing our Sudoku
data, we retrieve the cell data by calling `.get<SudokuCell>(coord)`. We then update the cell's value and set whether it
is correct. Finally, we call `.set(key, toSet)` to update the data in the `SharedMap`.

This pattern of first retrieving an object from a `SharedMap`, updating it, then setting it again, is an idiomatic Fluid
pattern. Without calling `.set()`, other clients will not be notified of the updates to the values within the map. By
setting the value, we ensure that Fluid notifies all other clients of the change.

Once the value is set, the `valueChanged` event will be raised on the SharedMap, and as you'll recall from the previous
section, we listen to that event and render again every time the values change. Both local and remote clients will
render based on this event, because all clients are running the same code.

**This is an important design principle:** components should have the same logic for handling local and remote changes.
In other words, it is very rare that there is a need for the handling to differ, and we recommend a unidirectional data
flow.

# Lab: Adding "presence" to the Fluid Sudoku component

The Sudoku component is collaborative; multiple clients can update the cells in real time. However, there's no
indication of where other clients are - which cells they're in. In this lab we'll add basic 'presence' to our Sudoku
component, so we can see where other clients are.

To do this, we'll create a new `SharedMap` to store the presence information. Like the map we're using for Sudoku data,
it will be a map of cell coordinates to client names. As clients select cells, the presence map will be updated with the
current client in the cell.

Note that using a SharedMap for presence means that the history of each user's movement - their presence - will be
persisted in the Fluid op stream. In the Sudoku scenario, maintaining a history of a client's movement isn't
particularly interesting, and Fluid provides an alternative mechanism, _signals_, to address cases where persisting ops
isn't necessary. That said, this serves as a useful example of how to use Fluid to solve complex problems with very
little code.

## Create a SharedMap to contain presence data

First, you need to create a `SharedMap` for your presence data.

1. Open `src/fluidSudoku.tsx`.
1. Inside the `FluidSudoku` class, declare two new private variables like so:

   ```ts
   private readonly presenceMapKey = "clientPresence";
   private clientPresence: ISharedMap | undefined;
   ```

1. Inside the `componentInitializingFirstTime` method, add the following code to the bottom of the method to create and
   register a second `SharedMap`:

   ```ts
   // Create a SharedMap to store presence data
   const clientPresence = SharedMap.create(this.runtime);
   this.root.set(this.presenceMapKey, clientPresence.handle);
   ```

   Notice that the Fluid runtime is exposed via the `this.runtime` property provided by [PrimedComponent][].

1. Inside the `componentHasInitialized` method, add the following code to the bottom of the method to retrieve the
   presence map when the component initializes:

   ```ts
   this.clientPresence = await this.root
     .get<IComponentHandle>(this.presenceMapKey)
     .get<ISharedMap>();
   ```

You now have a `SharedMap` to store presence data. When the component is first created, `componentInitializingFirstTime`
will be called and the presence map will be created. When the component is loaded, `componentHasInitialized` will be
called, which retrieves the `SharedMap` instance.

## Rendering presence

Now that you have a presence map, you need to render some indication that a remote user is in a cell. We're going to
take a shortcut here because our SudokuView React component can already display presence information when provided two
optional props:

```ts
clientPresence?: ISharedMap;
setPresence?(cellCoord: CoordinateString, reset: boolean): void;
```

We aren't providing those props, so the presence display capabilities within the React component aren't enabled. After
you've completed this tutorial, you should consider reviewing the implementation of the presence rendering within
SudokuView in detail. For now, however, we'll skip that and focus on implementing the two necessary props - a SharedMap
for storing the presence data, and a function to update the map with presence data.

## Setting presence data

1. Open `src/fluidSudoku.tsx`.
1. Add the following function at the bottom of the `FluidSudoku` class:

   ```ts
   /**
    * A function that can be used to update presence data.
    *
    * @param cellCoordinate - The coordinate of the cell to set.
    * @param reset - If true, presence for the cell will be cleared.
    */
   private readonly presenceSetter = (cellCoordinate: string, reset: boolean): void => {
       if (this.clientPresence) {
           if (reset) {
               // Retrieve the current clientId in the cell, if there is one
               const prev = this.clientPresence.get<string>(cellCoordinate);
               const isCurrentClient = this.runtime.clientId === prev;
               if (!isCurrentClient) {
                   return;
               }
               this.clientPresence.delete(cellCoordinate);
           } else {
               this.clientPresence.set(cellCoordinate, this.runtime.clientId);
           }
       }
   };
   ```

   You can pass this function in to the `SudokuView` React component as a prop. The React component will call
   `presenceSetter` when users enter and leave cells, which will update the presence `SharedMap`.

1. Replace the `createJSXElement` method with the following code:

   ```ts
   public createJSXElement(props?: any): JSX.Element {
       if (this.puzzle) {
           return (
               <SudokuView
                   puzzle={this.puzzle}
                   clientPresence={this.clientPresence}
                   clientId={this.runtime.clientId}
                   setPresence={this.presenceSetter}
               />
           );
       } else {
           return <div />;
       }
   }
   ```

   Notice that we're now passing the `clientPresence` SharedMap and the `setPresence` function as props.

## Listening to distributed data structure events

1. Still in `src/fluidSudoku.tsx`, add the following code to the bottom of the `componentHasInitialized` method to call
   render whenever a remote change is made to the presence map:

   ```ts
   this.clientPresence.on("valueChanged", (changed, local, op) => {
     this.render();
   });
   ```

## Testing the changes

Now run `npm start` again and notice that your selected cell is now highlighted on the other side.

## What's next

Now that you have some experience with Fluid, are there other features you could add to the Sudoku component? Perhaps
you could extend it to display a client name in the cell to show client-specific presence. Or you could use the
[undo-redo][] package to add undo/redo support!

If you want to build your own component, check out [yo fluid](../guide/yo-fluid.md).

See [Examples](./examples.md) for more examples.

<!-- Links -->

[icomponenthtmlvisual]: ../api/fluid-component-core-interfaces.IComponentHTMLVisual.md
[icomponentreactviewable]: ../api/fluid-aqueduct-react.IComponentReactViewable.md
[iprovidecomponenthtmlvisual]: ../api/fluid-component-core-interfaces.IProvideComponentHTMLVisual.md
[primedcomponent]: ../api/fluid-aqueduct.PrimedComponent.md
[shareddirectory]: ../api/fluid-map.SharedDirectory.md
[sharedmap]: ../api/fluid-map.SharedMap.md
[undo-redo]: ../api/fluid-undo-redo.md
