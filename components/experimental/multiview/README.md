# Multiview

The packages contained in this directory demonstrate how a container author might assemble an experience from a variety of distinct packages.  In particular, it demonstrates separation of view and model (via an interface) and leverages this separation to render multiple views of a model, render views which use multiple models, and render nested views against nested models.

## Trying it out

First go to the /container directory and `npm run start` to see the demo in action.

## ICoordinate, IConstellation (/interface)

The first two scenarios only use `ICoordinate`.  `ICoordinate` is the interface that we use to make clean separation between our view and model.  It defines the full API surface needed to interact with a 2d coordinate.

The third scenario also uses `IConstellation`, which defines an API surface for a model which nests `ICoordinates` (as "stars").

## Coordinate (/coordinate-model)

`Coordinate` is then our implementation of the `ICoordinate` interface, which is used throughout this example.

## Coordinate-based views (/slider-coordinate-view, /plot-coordinate-view, /triangle-view)

The three views in this example utilize `ICoordinate`s in different ways to modify and render the underlying data.  The slider view allows manipulation of the coordinate using sliders.  The plot view can render the coordinate in 2d space, while the triangle view takes three separate `ICoordinate`s to render a triangle.

## Constellation (/constellation-model)

`Constellation` is a component that maintains a collection of `Coordinates` ("stars").  It offers API surface to add coordinates and retrieve them, plus an event to notify when the collection of coordinates has been modified.

## ConstellationView (/constellation-view)

## The container (/container)

The container does the assembly of the implementation packages above (model + 3 views), which otherwise have no relationship between themselves (imagine they have been built by 4 distinct development teams, and the container developer is a fifth).

The container developer must perform first-time setup when the container is instantiated for the first time.  In this case, we prepare `Coordinate`s for the views we'll want to show.

The container developer also has the responsibility of determining how to respond to requests against the `Container`.  In this case, it only responds to a default request (`"/"`) with a composition of several views, using the `Coordinate`s it initialized upon its creation.
