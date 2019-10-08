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

Each value stored in the map is a `SudokuCell`, a simple class that contains the following properties:

```typescript
value: number // The current value in the cell; 0 denotes an empty cell
isCorrect: boolean = false // True if the value in the cell is correct
readonly fixed: boolean; // True if the value in the cell is supplied as part of the puzzle's "clues"
readonly correctValue: number // Stores the correct value of the cell
readonly coordinate: CoordinateString // The coordinate of the cell, as a comma-separated string, e.g. "2,3"
```

## Rendering

In order to render the Sudoku data, we use a React component called `SudokuView` This component is defined in
`view/sudokuView.tsx` and accepts the map of Sudoku cell data as a prop. It then renders the Sudoku and accompanying UI.

The `SudokuView` React component is also responsible for handling UI interaction from the user; we'll examine that in
more detail later.

## The WebPart/Fluid component

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

public onInitializeFirstTime() {
  // Create a new map for our Sudoku data
  const map = SharedMap.create(this._fluidShim.runtime);

  // Populate it with some puzzle data
  loadPuzzle(0, map);

  // Add it to our root directory
  this._fluidShim.root.set(this.sudokuMapKey, map.handle);
}
```

This method is called once when a component is initially created. We create a new SharedMap using `.create`, then add it
to our root SharedDirectory.

Shared objects that are stored within other Shared objects (e.g. a SharedMap within the root, which is itself a
SharedDirectory) must be retrieved asynchronously. We do that from the asynchronous onAfterInitialize method, then store
a local reference to the object so we can easily use it in synchronous code.

```typescript
public async onAfterInitialize() {
  // Our "puzzle" SharedMap is stored as a handle on the "root" SharedDirectory. To get it we must make a
  // synchronous call to get the IComponentHandle, then an asynchronous call to get the ISharedMap from the
  // handle.
  this.puzzle = await this._fluidShim.root
    .get<IComponentHandle>(this.sudokuMapKey)
    .get<ISharedMap>();

  // Since we're using a Fluid distributed data structure to store our Sudoku data, we need to render whenever a value
  // in our map changes. Recall that distributed data structures can be changed by both local and remote clients, so
  // if we don't call render here, then our UI will not update when remote clients change data.
  this.puzzle.on("valueChanged", (changed, local, op) => {
    this.render();
  });
}
```

### Handling events from distributed data structures

Distributed data structures can be changed by both local and remote clients. In the onAfterInitialize method, we also
connect a method to be called each time the Sudoku data - the SharedMap - is changed. In our case we simply call render
again. This ensures that our UI updates whenever a remote client changes the Sudoku data.

```typescript
  this.puzzle.on("valueChanged", (changed, local, op) => {
    this.render();
  });
```

## Connecting it all together

We've now reviewed the SudokuView React component, which handles most of the rendering, and the SudokuWebPart class,
which is the Sudoku Fluid component itself. We've shown how those two classes work together to render content to the
screen and share data using a Fluid distributed data structure.

The final step is to connect everything together, so that the framework knows how to load your component code. To see
how that's done, look at the `index.ts` file.

```typescript
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

import { SudokuWebPart } from "./sudoku/SudokuWebPart";
import { MFxComponentFactory } from "./packages/mfx-web-part-base/MFxComponentFactory";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const chaincodeName = pkg.name as string;

export const MFxInstantiationFactory = new MFxComponentFactory(
  SudokuWebPart
);

export const fluidExport = new SimpleModuleInstantiationFactory(
  chaincodeName,
  (new Map([
    [chaincodeName, Promise.resolve(MFxInstantiationFactory)],
  ])),
);

// This is needed for SPFx
export { SudokuWebPart as default } from './sudoku/SudokuWebPart';
```

# Implementing a Fluid component interface

TODO: will walk through adding the [IComponentReactViewable][] interface.

# Adding "presence" to the Fluid Sudoku component

TODO: will walk through creating a second map for presence and adjusting the code to handle everything. Will also call
out that this approach will persist all of the presence data, which often isn't what you want, but that this is a useful
implementation to illustrate how to use richer data models.

# Adding move history to the Fluid Sudoku component

TODO: **(stretch goal)** will walk through adding a SharedObjectSequence to store the history of moves that have
been made.

<!-- Links -->
[IComponentHTMLVisual]: xref:@microsoft/fluid-component-core-interfaces!IComponentHTMLVisual:interface
[IProvideComponentHTMLVisual]: xref:@microsoft/fluid-component-core-interfaces!IProvideComponentHTMLVisual:interface
[IComponentReactViewable]: xref:@microsoft/fluid-aqueduct-react!IComponentReactViewable:interface
