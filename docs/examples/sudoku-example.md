---

title: Connect your client-side web part to SharePoint (Hello World part 2)
description: Access functionality and data in SharePoint and provide a more integrated experience for end users.
uid: sudoku-example

---

Table of contents:

- Overview of example and goals
  - Learn about the SharedMap and SharedDirectory
  - Distributed data structures and SPFx


In this example we will build a collaborative Sudoku game. We will use Fluid distributed data structures to store and
synchronize the Sudoku data.

# Set up your dev environment

1. Install Node.js 10 and VS Code
1. Clone the following git repo
    1. (or copy a zip file)
1. Open the resulting folder in VS Code

## Folder layout

The project has the following folder layout:

```text
├───config
│       config.json
│       copy-assets.json
│       package-solution.json
│       write-manifests.json
├───copyToDist
│       906962ff-9406-47e2-9f63-a21cf04314ca.manifest.json
│       906962ff-9406-47e2-9f63-a21cf04314ca_color.png
│       906962ff-9406-47e2-9f63-a21cf04314ca_outline.png
│       package.json
└───src
    │   index.ts
    └───sudoku
        │   SudokuWebPart.tsx
        │   SudokuWebPart.manifest.json
        ├───helpers
        │       coordinate.ts
        │       puzzles.ts
        │       styles.css
        │       sudokuCell.ts
        └───view
                sudokuView.tsx
```

The *config* folder contains the WebPart configuration files. The *copyToDist* folder contains files that will be copied
to the **dist** folder when the project is built. Finally, the *src* folder contains the source files for the Sudoku
Fluid component, which we'll cover in more depth later.

# Run the sample locally

> [!WARNING]
> This is contingent on making the component loadable using `fluid-webpack-component-loader`.

In order to run the example, run `npm start` from the project root. Then visit <http://localhost:8080/> in a browser.
Two instances of the Sudoku component will be loaded side by side. Try entering numbers in the cells in either component
instance. Changes will be synchronized to the other instance.

Try changing the theme in one of the components. Notice that these changes are not synchronized between the two
instances.

# Deep dive

## Data model

For our Sudoku data model, we will use a map-like data structure with string keys. Each key in the map is a coordinate
(row, column) of a cell in the Sudoku puzzle. The top left cell has coordinate `"0,0"`, the cell to its right has
coordinate `"0,1"`, etc.

| 0,1 | 0,2 | 0,3 | 0,4 | 0,5 | 0,6 | 0,7 | 0,8 | 0,9 |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| 1,1 | 1,2 | 1,3 | 1,4 | 1,5 | 1,6 | 1,7 | 1,8 | 1,9 |
| 2,1 | 2,2 | 2,3 | 2,4 | 2,5 | 2,6 | 2,7 | 2,8 | 2,9 |
| 3,1 | 3,2 | 3,3 | 3,4 | 3,5 | 3,6 | 3,7 | 3,8 | 3,9 |
| 4,1 | 4,2 | 4,3 | 4,4 | 4,5 | 4,6 | 4,7 | 4,8 | 4,9 |
| 5,1 | 5,2 | 5,3 | 5,4 | 5,5 | 5,6 | 5,7 | 5,8 | 5,9 |
| 6,1 | 6,2 | 6,3 | 6,4 | 6,5 | 6,6 | 6,7 | 6,8 | 6,9 |
| 7,1 | 7,2 | 7,3 | 7,4 | 7,5 | 7,6 | 7,7 | 7,8 | 7,9 |
| 8,1 | 8,2 | 8,3 | 8,4 | 8,5 | 8,6 | 8,7 | 8,8 | 8,9 |
| 9,1 | 9,2 | 9,3 | 9,4 | 9,5 | 9,6 | 9,7 | 9,8 | 9,9 |

Each value stored in the map is a `SudokuCell`, a simple class that contains the following properties:

```typescript
value: number // The current value in the cell; 0 denotes an empty cell
isCorrect: boolean = false // True if the value in the cell is correct
readonly fixed: boolean; // True if the value in the cell is supplied as part of the puzzle's "clues"
readonly correctValue: number // Stores the correct value of the cell
readonly coordinate: CoordinateString // The coordinate of the cell, as a comma-separated string, e.g. "2,3"
```

> [!IMPORTANT]
> Objects that are stored in distributed data structures, as SudokuCell is, must be safely JSON-serializable. This means
> that you cannot use functions or TypeScript class properties with these objects, because those are not
> JSON-serialized.
>
> One pattern to address this is to define static functions that accept the object as a parameter and manipulate it. See
> the SudokuCell class in `/helpers/sudokuCell.ts` for an example of this pattern.

## Rendering

In order to render the Sudoku data, we use a React component called `SudokuView` This component is defined in
`view/sudokuView.tsx` and accepts the map of Sudoku cell data as a prop. It then renders the Sudoku and accompanying UI.

The `SudokuView` React component is also responsible for handling UI interaction from the user; we'll examine that in
more detail later.

## The Fluid component

The React component described above does not itself represent a Fluid component. Rather, the Fluid component is defined
in `src/SudokuWebPart.tsx`.

```typescript
export class SudokuWebPart extends BaseMFxPart<{}> {}
```

This class extends the `BaseMfxPart` abstract base class. Our component is visual, so we need to implement the
[IComponentHTMLVisual][] or [IProvideComponentHTMLVisual][] interfaces. However, the BaseMfxPart base class already
implements the IProvideComponentHTMLVisual Fluid component interface, so we do not need to explicitly implement it in
our class.

We are required to implement the `render()` method, which is straightforward since we're using the `SudokuView` React
component to do the heavy lifting.

```typescript
  public render(): void {
    ReactDOM.render(
      <SudokuView puzzle={this.puzzle} />,
      this.domElement);
  }
```

As you can see, the render method uses React to render the `SudokuView` React component, passing in the map of Sudoku
cell data in the `puzzle` prop.

### Creating Fluid distributed data structures

How does the `puzzle` property get populated? How are distributed data structures created and used?

To answer that question, look at the `onInitializeFirstTime` method in the `SudokuWebPart` class:

```typescript
private sudokuMapKey = "sudoku-map";
private puzzle: ISharedMap;

public async onInitializeFirstTime() {
  // Create a new map for our Sudoku data
  const map = SharedMap.create(this._fluidShim.runtime, this.sudokuMapKey);

  // Populate it with some puzzle data
  loadPuzzle(0, map);

  // Register the map with the Fluid runtime
  map.register();
}
```

This method is called once when a component is initially created. We create a new [SharedMap][] using `.create`, then
add it to our root SharedDirectory.

Shared objects that are stored within other Shared objects (e.g. a SharedMap within the root, which is itself a
SharedDirectory) must be retrieved asynchronously. We do that from the asynchronous onInit method, then store a local
reference to the object so we can easily use it in synchronous code.

```typescript
    public async onInit() {
        // TODO: The comment below is misleading now because it was based on having a root map and adding new DDS to it
        // rather than retrieving the channel.

        // Our "puzzle" SharedMap is stored as a handle on the "root" SharedDirectory. To get it we must make a
        // synchronous call to get the IComponentHandle, then an asynchronous call to get the ISharedMap from the
        // handle.
        this.puzzle = await this._fluidShim.runtime.getChannel(this.sudokuMapKey) as ISharedMap;

        // Since we're using a Fluid distributed data structure to store our Sudoku data, we need to render whenever a value
        // in our map changes. Recall that distributed data structures can be changed by both local and remote clients, so
        // if we don't call render here, then our UI will not update when remote clients change data.
        this.puzzle.on("valueChanged", (changed, local, op) => {
            this.render();
        });
    }
```

### Handling events from distributed data structures

Distributed data structures can be changed by both local and remote clients. In the `onAfterInitialize` method, we also
connect a method to be called each time the Sudoku data - the [SharedMap][] - is changed. In our case we simply call render
again. This ensures that our UI updates whenever a remote client changes the Sudoku data.

```typescript
  this.puzzle.on("valueChanged", (changed, local, op) => {
    this.render();
  });
```

### Updating distributed data structures

In the previous step we showed how to use event listeners with distributed data structures to respond to remote data
changes. But how do we update the data based on user input? To do that, we need to listen to some DOM events as users
enter data in the Sudoku cells. Since the `SudokuView` class handles the rendering, that's where the DOM events will be
handled.

Let's look at the event handler for the change event from each Sudoku cell:

> [!NOTE]
> The `handleChange` function can be found in the `SimpleTable` React component within `view/sudokuView.ts`.
> `SimpleTable` is a helper React component that is not exported; you can consider it part of the `SudokuView` React
> component.

```typescript
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let valueToSet = Number(e.target.value);
    valueToSet = Number.isNaN(valueToSet) ? 0 : valueToSet;
    const key = e.target.getAttribute("data-fluidmapkey");
    if (key !== null) {
        const toSet = props.puzzle.get<SudokuCell>(key);
        toSet.value = valueToSet;
        toSet.isCorrect = valueToSet === toSet.correctValue;
        props.puzzle.set(key, toSet);
    }
};
```

Lines 2 and 3 ensure we only accept numeric values. In line 4, we retrieve the coordinate of the cell from a DOM
attribute that we added during render. Once we have the coordinate, which is a key in the `SharedMap` storing our Sudoku
data, we retrieve the cell data by calling `.get<SudokuCell>(key)`. We then update the cell's value and set whether it
is correct. Finally, we call `.set(key, toSet)` to update the data in the `SharedMap`.

This pattern of first retrieving an object from a `SharedMap`, updating it, then setting it again, is an idiomatic Fluid
pattern. Without calling `.set()`, other clients will not be notified of the updates to the values within the map. By
setting the value, we ensure that Fluid notifies all other clients of the change.

Once the value is set, the `valueChanged` event will be raised on the SharedMap, and as you'll recall from the previous
section, we listen to that event and render again every time the values change. Both local and remote clients will
render based on this event, because all clients are running the same code.

## Connecting it all together

We've now reviewed the `SudokuView` React component, which handles most of the rendering and updates distributed data
structures as needed, and the `SudokuWebPart` class, which is the Sudoku Fluid component itself. We've shown how those
two classes work together to render content to the screen and share data using a Fluid distributed data structure.

The final step is to connect everything together, so that the framework knows how to load your component code. To see
how that's done, look at the `index.ts` file.

```typescript
import { SharedMap } from "@microsoft/fluid-map";
import { MFxComponentFactory, SimpleModuleInstantiationFactory } from "@ms/mfx-part-base";
import { SudokuWebPart } from "./sudoku/SudokuWebPart";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const componentName = pkg.name as string;

const sudokuInstantiationFactory = new MFxComponentFactory(
    SudokuWebPart,
    [SharedMap.getFactory()]);

export const fluidExport = new SimpleModuleInstantiationFactory(
    componentName,
    new Map([
        [componentName, Promise.resolve(sudokuInstantiationFactory)],
    ] as any)
);
```

### Component and distributed data structure factories

A Fluid component must provide a factory that the runtime uses to create the component. The `MFxComponentFactory` class
makes it easy to create factories for components that inherit from `BaseMFxComponent`. You pass it your Fluid component
class (`SudokuWebPart` in this case), as well as an array of distributed data structure factories. If your component
uses any distributed data structures, their factories must all be registered. All distributed data structures provide a
factory.

A Fluid component is, in some ways, a collection of distributed data structures. While a component does not need to use
distributed data structures, most will. Registering the distributed data structure factories that your component uses
ensures the runtime can initialize both your component and the data structures it depends on.

If your module contains several components, each will require a factory. Since our module only contains a single
component, we only need to create one factory.

### Another factory: fluidExport

A Fluid component must export an object called `fluidExport` from its entrypoint module. This export is what the Fluid
runtime uses to load components. The `SimpleModuleInstantiationFactory` class can be used to simplify this process. You
need to provide the name of the default component in your module, along with a mapping of component names (strings) to
factories that create the component.

# Lab: Adding "presence" to the Fluid Sudoku component

<!--
TODO: will walk through creating a second map for presence and adjusting the code to handle everything. Will also call
out that this approach will persist all of the presence data, which often isn't what you want, but that this is a useful
implementation to illustrate how to use richer data models.
-->

The Sudoku component is collaborative; multiple clients can update the cells in real time. However, there's no
indication of where other clients are - which cells they're in. In this lab we'll add basic 'presence' to our Sudoku
component, so we can see where other clients are.

To do this, we'll create a new `SharedMap` to store the presence information. Like the map we're using for Sudoku data,
it will be a map of cell coordinates to client names. As clients select cells, the presence map will be updated with the
current client in the cell.

Note that using a SharedMap for presence means that the history of each user's movement - their presence - will be
persisted in the Fluid op stream. In this particular scenario, maintaining a history of a client's movement isn't
particularly interesting, and Fluid provides an alternative mechanism, _signals_, to address cases where persisting ops
isn't necessary. That said, this serves as a useful example of how to use Fluid to solve complex problems with very
little code.

## Create a SharedMap to contain presence data

First, you need to create a `SharedMap` for your presence data.

1. Open `src/sudoku/SudokuWebPart.tsx`.
1. Inside the `SudokuWebPart` class, declare two new private variables like so:

    ```ts
    private presenceMapKey = "clientPresence";
    private clientPresence: ISharedMap;
    ```

1. Inside the `onInitializeFirstTime` method, add the following code below the existing code to create and register a
   second `SharedMap`:

    ```ts
    // Create and register a SharedMap to store presence data
    const clientPresence = SharedMap.create(this._fluidShim.runtime, this.presenceMapKey);
    clientPresence.register();
    ```

    Notice that the Fluid runtime is exposed via the `_fluidShim` property provided by `BaseMfxPart`.

1. Inside the `onInit` method, add the following code below the existing code to retrieve the presence map when the
   component initializes:

    ```ts
    this.clientPresence = await this._fluidShim.runtime.getChannel(this.presenceMapKey) as ISharedMap;
    ```

    You now have a `SharedMap` to store presence data. When the component is created initially, `onInitializeFirstTime`
    will be called and the presence map will be created. When the component is loaded, `onInit` will be called, which
    retrieves the `SharedMap` instance.

## Rendering presence

Now that you have a presence map, you need to render some indication that a remote user is in a cell.

1. Open `src/sudoku/view/sudokuView.tsx`.
1. Add the following code to the `ISudokuViewProps` interface:

    ```ts
    clientId: string;
    clientPresence?: ISharedMap;
    setPresence?(cellCoord: CoordinateString, reset: boolean): void;
    ```

    This interface defines the props that the React component accepts. `setPresence` is a function that the React
    component will call to update presence. Notice that the `clientPresence` and `setPresence` properties are optional.
    This allows the same React component to be used both with and without presence.

1. Inside the `renderGridRows` method, add the following code **before** this line:
   `const disabled = currentCell.fixed === true;`

    ```ts
    if (props.clientPresence) {
        const cellOwner = props.clientPresence.get(coord);
        if (cellOwner && cellOwner !== props.clientId) {
            inputClasses += " presence";
        }
    }
    ```

    You have now added a CSS class to cells based on the data in the presence map. To make sure the local client doesn't
    see presence styles in their own cell, the second if check ensures that the cell is occupied by someone other than
    the local client.

## Setting presence data: DOM events

As users click in and out of cells, you need to update the presence map.

1. Still in `src/sudoku/view/sudokuView.tsx`, add the following event handlers under the `handleChange` method:

    ```ts
    const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (props.setPresence) {
            const key = e.target.getAttribute("data-fluidmapkey");
            if (key !== null) {
                props.setPresence(key, false);
            }
        }
    };

    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        if (props.setPresence) {
            const key = e.target.getAttribute("data-fluidmapkey");
            if (key !== null) {
                props.setPresence(key, true);
            }
        }
    };
    ```

1. Inside the `renderGridRows` method, add `onFocus` and `onBlur` attributes connecting the DOM events to your handlers:

    ```tsx
    onFocus={handleInputFocus}
    onBlur={handleInputBlur}
    ```

## Setting presence data: Wiring it all together

1. Open `src/sudoku/SudokuWebPart.tsx`.
1. Add the following function at the bottom of the `SudokuWebPart` class:

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
                const isCurrentClient = this._fluidShim.runtime.clientId === prev;
                if (!isCurrentClient) {
                    return;
                }
                this.clientPresence.delete(cellCoordinate);
            } else {
                this.clientPresence.set(cellCoordinate, this._fluidShim.runtime.clientId);
            }
        }
    }
    ```

    You can pass this function in to the `SudokuView` React component as a prop. The component will call it when users
    enter and leave cells, which will update the presence `SharedMap`.

1. Replace the `render` method with the following code:

    ```ts
    public render(): void {
        ReactDOM.render(
            <SudokuView puzzle={this.puzzle}
                clientPresence={this.clientPresence}
                clientId={this._fluidShim.runtime.clientId}
                setPresence={this.presenceSetter}
            />,
            this.domElement);
    }
    ```

    Notice that all of the props you added earlier to the `ISudokuViewProps` interface are now provided.

## Listening to distributed data structure events

1. Still in `src/sudoku/SudokuWebPart.tsx`, add the following code to call render whenever a remote change is made to
   the presence map:

    ```ts
    this.clientPresence.on("valueChanged", (changed, local, op) => {
        this.render();
    });
    ```

## Testing the changes

TODO

# Implementing a Fluid component interface

TODO: will walk through adding the [IComponentReactViewable][] interface.

# Adding move history to the Fluid Sudoku component

TODO: **(stretch goal)** will walk through adding a SharedObjectSequence to store the history of moves that have been
made.

<!-- Links -->
[IComponentHTMLVisual]: xref:@microsoft/fluid-component-core-interfaces!IComponentHTMLVisual:interface
[IProvideComponentHTMLVisual]: xref:@microsoft/fluid-component-core-interfaces!IProvideComponentHTMLVisual:interface
[IComponentReactViewable]: xref:@microsoft/fluid-aqueduct-react!IComponentReactViewable:interface
[SharedMap]: @microsoft/fluid-map!SharedMap:class
