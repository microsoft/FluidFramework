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

The class first defines the `mouseSignalType` that will be sent and listened to the connected clients when there is a presence change:

```typescript
export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    private static readonly mouseSignalType = "positionChanged";

    /*...*/
}
```
The class also initializes a local map of `IMousePosition` values for all of the connected clients. Each userID can have multiple clientIDs (e.g. same user on seperate devices), which explains the nested `Map`. This local map is what populates the view and what will be updated on `mouseSignalType` signals:

```typescript
export interface IMousePosition {
    x: number;
    y: number;
}

export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    /*...*/

    /**
     * Local map of mouse position status for clients
     *
     * ```
     * Map<userId, Map<clientid, position>>
     * ```
     */
    private readonly posMap = new Map<string, Map<string, IMousePosition>>();

    /*...*/
}
```
Now that we have clarity about what `posMap` and `mouseSignalType` are, we can move to the constructor to see what other behavior our `MouseTracker` has.

We'll begin by looking at the constructor arguments. `MouseTracker` takes in the `audience` and the `Signaler` instance from `initialObjects`:

```typescript
export interface IMouseTrackerEvents extends IEvent {
    (event: "mousePositionChanged", listener: () => void): void;
}

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
Whenever a member leaves the audience (e.g. a client disconnects from the container), we would want to remove their presence from our local data. After this is done, we would have to let the view know that the local presence data has changed. To do this, we emit our `mousePositionChanged` `IMouseTrackerEvent` so the view knows to re-render:

```typescript
export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    /*...*/

    public constructor(
      public readonly audience: IServiceAudience<IMember>,
      private readonly signaler: Signaler,
    ){
      super();

      this.audience.on("memberRemoved", (clientId: string, member: IMember) => {
            const clientIdMap = this.posMap.get(member.userId);
            if (clientIdMap !== undefined) {
                clientIdMap.delete(clientId);

                //If UserID has no connected clients, remove user from local data
                if (clientIdMap.size === 0) {
                    this.posMap.delete(member.userId);
                }
            }
            this.emit("mousePositionChanged");
        });

        /*...*/
    }

    /*...*/
}
```
We know that `MouseTracker` must be able to share information to all connected clients about where the current client's mouse position is. This is where `Signaler` comes in handy, as it specializes in communicating transient data to connected clients within a Fluid application.

To track the client's mouse position, we use the `mousemouve` event to obtain the client's x and y coordinates. To alert the connected clients of a mouse position change, we then submit a `mouseSignalType` signal with the client's userID and updated position value as the paylod:

```typescript
export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    /*...*/

    public constructor(
      public readonly audience: IServiceAudience<IMember>,
      private readonly signaler: Signaler,
    ){
      super();

      /*...*/

      window.addEventListener("mousemove", (e) => {
            const position: IMousePosition = {
                x: e.clientX,
                y: e.clientY,
            };
            this.sendMouseSignal(position);
        });

        /*...*/
    }

    /**
     * Alert all connected clients that there has been a change to a client's mouse position
     */
    private sendMouseSignal(position: IMousePosition) {
        this.signaler.submitSignal(
            MouseTracker.mouseSignalType,
            { userId: this.audience.getMyself()?.userId, pos: position },
        );
    }

    /*...*/
}
```
But, what point is there of sending a signal if nobody is listening to it? To listen to the `mouseSignalType`, we use `Signaler`'s `onSignal` function. We then update the local data using the payload information from the signal. To display the new presence data, we then emit `mousePositionChanged` to let the view know to re-render:

```typescript
export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    /*...*/

    public constructor(
      public readonly audience: IServiceAudience<IMember>,
      private readonly signaler: Signaler,
    ){
      super();

      /*...*/

      this.signaler.onSignal(MouseTracker.mouseSignalType, (clientId, local, payload) => {
            this.onMouseSignalFn(clientId, payload);
        });

        /*...*/
    }

    /*...*/

    private readonly onMouseSignalFn = (clientId: string, payload: any) => {
        const userId: string = payload.userId;
        const position: IMousePosition = payload.pos;

        let clientIdMap = this.posMap.get(userId);
        if (clientIdMap === undefined) {
            clientIdMap = new Map<string, IMousePosition>();
            this.posMap.set(userId, clientIdMap);
        }
        clientIdMap.set(clientId, position);
        this.emit("mousePositionChanged");
    };

    /*...*/
}
```


## FocusTracker

## View





