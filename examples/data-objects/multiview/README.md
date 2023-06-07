# Multiview

The packages contained in this directory demonstrate how a container author might assemble an experience from a variety of distinct packages. In particular, it demonstrates separation of view and model (via an interface) and leverages this separation to render multiple views of a model, render views which use multiple models, and render nested views against nested models.

## Trying it out

First go to the /container directory and `npm run start` to see the demo in action.

## ICoordinate, IConstellation (/interface)

The first two scenarios only use the `ICoordinate` interface, which is how we'll make clean separation between our coordinate's view and model. It defines the full API surface needed to interact with a 2d coordinate.

The third scenario also uses `IConstellation`, which defines an API surface for a model which nests `ICoordinates` (as "stars").

## Coordinate (/coordinate-model)

`Coordinate` is then our implementation of the `ICoordinate` interface, which is used throughout this example.

## ICoordinate-based views (/slider-coordinate-view, /plot-coordinate-view, /triangle-view)

These three views utilize `ICoordinate`s in different ways to modify and render the underlying data. The slider view allows manipulation of a coordinate using sliders. The plot view can render a coordinate in 2d space, while the triangle view takes three separate `ICoordinate`s to render a triangle.

## Constellation (/constellation-model)

`Constellation` is a component that implements the `IConstellation` interface, and its purpose is to maintain a collection of `Coordinates` ("stars") which are nested components. It offers API surface to add coordinates, retrieve them, and observe changes to the set.

## ConstellationView (/constellation-view)

`ConstellationView` is a nested view that pairs with the nested model of an `IConstellation`. It is able to access the nested `ICoordinate`s via the `IConstellation`'s public API surface. After retrieving the `ICoordinate`s, it binds them to views of its own choosing.

## The container (/container)

The container does the assembly of the implementation packages above, which otherwise have no relationship between themselves (imagine they have each been built by distinct development teams, and the container developer is from yet another separate team).

The container developer must perform first-time setup when the container is instantiated for the first time. In this case, we prepare `Coordinate`s and `Constellation`s for the views we'll want to show.

The container developer also has the responsibility of determining how to respond to requests against the `Container`. In this case, it only responds to a default request (`"/"`) with a composition of several views, using the models it initialized upon its creation.

## TODO

Remove usage of webpack-fluid-loader and relocate to /examples/view-integration
