---
title: Using Signals in Fluid
menuPosition: 5
draft: true
---

In this recipe, you'll learn how the `Signaler` DataObject is used in a Fluid application to deal with a couple user presence scenarios. The two forms of presence that are covered in this example are focus tracking and mouse tracking. This article will go over how the `Signaler` DataObject is created, how both `MouseTracker` and `FocusTracker` classes work using the `Signaler` object, and how the view uses both classes to render the presence data.

## Creation

The `Signaler` DataObject is first included in the `initialObjects` of the Fluid `ContainerSchema` which defines which shared objects will be at our disposal in the new container.

```typescript
const containerSchema: ContainerSchema = {
    initialObjects: {
        /* [id]: DataObject */
        signaler: Signaler,
    },
};
```

The `FluidContainer` is then created (or fetched if it already exists) alongside the `services` object, since audience will be required in this application. To learn more about how to create a new Fluid container and load an exisiting container, see our [DiceRoller Tutorial](https://fluidframework.com/docs/start/tutorial/).

## MouseTracker

Let's now take a look at how the `MouseTracker` class uses the `Signaler` DataObject to achieve the first form of user presence within the application.

The `MouseTracker` constructor takes the `audience` and the `Signaler` instance as arguments:

```typescript
export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    /*...*/
    public constructor(
      public readonly audience: IServiceAudience<IMember>,
      private readonly signaler: Signaler,
    ){
      super();
      /*...*/
    }
    /*...*/
}
```

The class first defines what signal types will need to be sent to the connected clients when there is a presence change:

```typescript
export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    private static readonly mouseSignalType = "positionChanged";
    /*...*/
    public constructor(
      public readonly audience: IServiceAudience<IMember>,
      private readonly signaler: Signaler,
    ){
      super();
      /*...*/
    }
    /*...*/
}
```




## FocusTracker

## View





