# Multiview

The packages contained in this directory demonstrate how a container author might assemble an experience from a variety of distinct packages.  In particular, it demonstrates separation of view and model (via an interface) and leverages this separation to render multiple views of a model, as well as render views which use multiple models.

## Trying it out

First go to the /container directory and `npm run start` to see the demo in action.

## ICoordinate (/interface)

`ICoordinate` is the interface that we use to make clean separation between our view and model.  It defines the full API surface needed to interact with a 2d coordinate.

## Coordinate (/model)

`Coordinate` is then our implementation of the `ICoordinate` interface, which is used throughout this example.

## The views (/sliderview, /plotview, /triangleview)

The three views in this example utilize `ICoordinate`s in different ways to modify and render the underlying data.  The slider view allows manipulation of the coordinate using sliders.  The plot view can render the coordinate in 2d space, while the triangle view takes three separate `ICoordinate`s to render a triangle.

## The container (/container)

The container does the assembly of the four implementation packages above (model + 3 views), which otherwise have no relationship between themselves (imagine they have been built by 4 distinct development teams, and the container developer is a fifth).

The container developer must perform first-time setup when the container is instantiated for the first time.  In this case, we prepare `Coordinate`s for the views we'll want to show.

The container developer also has the responsibility of determining how to respond to requests against the `Container`.  In this case, it only responds to a default request (`"/"`) with a composition of several views, using the `Coordinate`s it initialized upon its creation.
