---
title: Using Signals in Fluid
menuPosition: 5
draft: true
---

In this article, we will go over the `PresenceTracker` example to learn how the [Signaler](https://github.com/microsoft/FluidFramework/tree/main/experimental/framework/data-objects/src/signaler) DataObject is used in a Fluid application to share user presence information between collaborators. We'll cover how the `Signaler` DataObject is used in both the `MouseTracker` and `FocusTracker` classes to share mouse position and focus state. You can find the completed code for this example in the Fluid Repo [here](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/presence-tracker).

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

The `FluidContainer` is then created (or loaded if it already exists) alongside the `services` object, since audience will be required in this application. To learn more about how to create a new Fluid container and load an existing container, see our [DiceRoller Tutorial](https://fluidframework.com/docs/start/tutorial/).

## MouseTracker

Let's look at how the `MouseTracker` class uses the `Signaler` DataObject to share mouse position information.

The class defines the `mouseSignalType` that will be sent to the connected clients when there is a presence change:

```typescript
export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    private static readonly mouseSignalType = "positionChanged";
    /*...*/
}
```
The class also initializes a local map (`posMap`) of `IMousePosition` values for all of the connected clients. Each audience member has a single userID along with multiple clientIDs representing each active connection the member has to the container (e.g., the same user connected to a container separate devices). In the circumstance that one user is connected on mulitple client devices, both of the user's mouse presences on each devices would appear seperately on the page. This the reason for the nesting of the position `Map`, which is used to populate the view and what will be updated on `mouseSignalType` signals. To learn more about audience members and connections click [here](https://fluidframework.com/docs/build/audience/).

```typescript
private readonly posMap = new Map<string, Map<string, IMousePosition>>();
```
```typescript
export interface IMousePosition {
    x: number;
    y: number;
}
```

Now that we have clarity about what `posMap` and `mouseSignalType` are, we need to use the `audience` and `Signaler` to send, receive, and interpret the positions.  We provide these in the constructor.

We'll begin by looking at the constructor arguments. `MouseTracker` takes in the `audience` and the `Signaler` instance from `initialObjects`:

```typescript
constructor(
  public readonly audience: IServiceAudience<IMember>,
  private readonly signaler: Signaler,
) {
  super();

  /*...*/
}
```
Whenever there is any change to a client's mouse position, a `mousePositionChanged` event is fired to notify listeners that updated data is available.

```typescript
export interface IMouseTrackerEvents extends IEvent {
    (event: "mousePositionChanged", listener: () => void): void;
}
```
When a member leaves the audience (e.g., a client disconnects from the container), we would want to remove their presence from our local data. After this is done, we would have to let the view know that the local presence data has changed. To do this, we emit our `mousePositionChanged` event so the view knows to re-render:

```typescript
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
```
`MouseTracker` must share information to all connected clients about where the local client's mouse position is. This is where `Signaler` comes in handy, as it specializes in communicating transient data to connected clients within a Fluid application.

To track the client's mouse position, we use the `mousemove` event to obtain the client's x and y coordinates. To alert the connected clients of a mouse position change, we then submit a `mouseSignalType` signal with the client's userID and updated position value as the payload:

```typescript
window.addEventListener("mousemove", (e) => {
    const position: IMousePosition = {
        x: e.clientX,
        y: e.clientY,
    };
    this.sendMouseSignal(position);
});
```
```typescript
/**
* Alert all connected clients that there has been a change to a client's mouse position
*/
private sendMouseSignal(position: IMousePosition) {
    this.signaler.submitSignal(
        MouseTracker.mouseSignalType,
        { userId: this.audience.getMyself()?.userId, pos: position },
    );
}
```
But what is the point of sending a signal if nobody is listening to it? To listen to the `mouseSignalType`, we use `Signaler`'s `onSignal` function. We then update the local data using the payload information from the signal. To display the new presence data, we then emit `mousePositionChanged` to let the view know to re-render:

```typescript
this.signaler.onSignal(MouseTracker.mouseSignalType, (clientId: string, local: boolean, payload: IMouseSignalPayload) => {
  this.onMouseSignalFn(clientId, payload);
});
```
```typescript
private readonly onMouseSignalFn = (clientId: string, payload: IMouseSignalPayload) => {
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
```
Note: The app defines `IMouseSignalPayload` to be the corresponding payload that is sent attached to the `mouseSignalType`

```typescript
export interface IMouseSignalPayload {
    userId: string;
    pos: IMousePosition;
}
```

## FocusTracker

HTML documents and elements within the documents can be focused on by users. Knowing which users are currently focused on the document is another intriuging form of user presence to explore. Let's now look at how the `FocusTracker` class uses the `Signaler` DataObject to share user focus infomation.

The class defines the `focusSignalType` that will be sent and listened to the connected clients when there is a presence change:

```typescript
export class FocusTracker extends TypedEventEmitter<IFocusTrackerEvents> {
    private static readonly focusSignalType = "changedFocus";
    /*...*/
}
```

The class then initializes a local map of boolean values for all of the connected clients. The boolean denotes whether or not the client is focused on the document:

```typescript
private readonly focusMap = new Map<string, Map<string, boolean>>();
```
We can now move to the constructor where we can see that `FocusTracker` takes in the `container`, the `audience`, and the `Signaler` instance from `initialObjects` as arguments:

```typescript
constructor(
  container: IFluidContainer,
  public readonly audience: IServiceAudience<IMember>,
  private readonly signaler: Signaler,
) {
  super();

  /*...*/
}
```
Just like in the `MouseTracker` class, whenever there is any change to a client's focus status we'll fire a `focusChanged` event to notify listeners that updated data is available:

```typescript
export interface IFocusTrackerEvents extends IEvent {
    (event: "focusChanged", listener: () => void): void;
}
```
Also similar to `MouseTracker`, a member leaves the audience we need to remove their presence from our local data and emit an event to let the view know that it needs to re-render to display the updated presence:

```typescript
this.audience.on("memberRemoved", (clientId: string, member: IMember) => {
    const focusClientIdMap = this.focusMap.get(member.userId);
    if (focusClientIdMap !== undefined) {
        focusClientIdMap.delete(clientId);
        if (focusClientIdMap.size === 0) {
            this.focusMap.delete(member.userId);
        }
    }
    this.emit("focusChanged");
});
```
To track the local client's focus status, we use the `focus` and `blur` events to know when the focus boolean must be updated. To alert the connected clients of this focus change, we then submit a `focusSignalType` signal with the client's userID and updated focus status as the paylod:

```typescript
window.addEventListener("focus", () => {
    this.sendFocusSignal(true);
});
window.addEventListener("blur", () => {
    this.sendFocusSignal(false);
});
```
```typescript
private sendFocusSignal(hasFocus: boolean) {
    this.signaler.submitSignal(
        FocusTracker.focusSignalType,
        { userId: this.audience.getMyself()?.userId, focus: hasFocus },
    );
}
```
To make sure all connected clients are notified of this focus change, we use the `onSignal` function to listen to the `focusSignalType`. We then update the local data using the payload information from the signal and emit a `focusChanged` event to re-render:

```typescript
this.signaler.onSignal(FocusTracker.focusSignalType, (clientId: string, local: boolean, payload: IFocusSignalPayload) => {
    this.onFocusSignalFn(clientId, payload);
});
```
```typescript
private readonly onFocusSignalFn = (clientId: string, payload: IFocusSignalPayload) => {
    const userId: string = payload.userId;
    const hasFocus: boolean = payload.focus;

    let clientIdMap = this.focusMap.get(userId);
    if (clientIdMap === undefined) {
        clientIdMap = new Map<string, boolean>();
        this.focusMap.set(userId, clientIdMap);
    }
    clientIdMap.set(clientId, hasFocus);
    this.emit("focusChanged");
};
```

Note: The app defines `IFocusSignalPayload` to be the corresponding payload that is sent attached to the `focusSignalType`

```typescript
export interface IFocusSignalPayload {
    userId: string;
    focus: boolean;
}
```

`FocusTracker` differs from `MouseTracker` as it uses the `Signal Request` pattern. This is when a newly joining client requests a specific signal to be sent from other connected clients, so that the new client can receive pertinent information immediately after connecting to the container.

To achieve this pattern, `FocusTracker` defines the `focusRequestType` that will be sent to request the focus status of all the connected clients:

```typescript
private static readonly focusRequestType = "focusRequest";
```
`FocusTracker` then sends this signal request immediately after the new client connects to the container. Once again, the `onSignal` function is used to listen to this `focusRequestType` signal and each client responds to the signal request with their current focus status:

```typescript
this.signaler.onSignal(FocusTracker.focusRequestType, () => {
    this.sendFocusSignal(document.hasFocus());
});

container.on("connected", () => {
    this.signaler.submitSignal(FocusTracker.focusRequestType);
});
```

## View

In `app.ts`, we create instances of the `MouseTracker` and the `FocusTracker` to use in our application:

```typescript
/*...*/

async function start(): Promise<void> {
    /*...*/

    // Render presence information for audience members
    const contentDiv = document.getElementById("focus-content") as HTMLDivElement;
    const mouseContentDiv = document.getElementById("mouse-position") as HTMLDivElement;
    const focusTracker = new FocusTracker(
        container,
        services.audience,
        container.initialObjects.signaler,
    );
    const mouseTracker = new MouseTracker(
        services.audience,
        container.initialObjects.signaler,
    );

    /*...*/
}

start().catch(console.error);
```

The view then renders the focus data by using `renderFocusPresence`, which uses the local focus status map to display which users are in focus and which users are. In the function, the `FocusTracker` instance listens to the `focusChanged` events that are fired every time there is a focus change to one of the clients. This triggers the re-render by calling `onFocusChanged` to display the updated the focus statuses:
```typescript
renderFocusPresence(focusTracker, contentDiv);
```
```typescript
function renderFocusPresence(focusTracker: FocusTracker, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "left";
    wrapperDiv.style.margin = "70px";
    div.appendChild(wrapperDiv);

    const focusDiv = document.createElement("div");
    focusDiv.style.fontSize = "14px";

    //Displays focus status of all users
    const onFocusChanged = () => {
        focusDiv.innerHTML = `
            Current user: ${(focusTracker.audience.getMyself() as TinyliciousMember)?.userName}</br>
            ${getFocusPresencesString("</br>", focusTracker)}
        `;
    };

    onFocusChanged();
    focusTracker.on("focusChanged", onFocusChanged);

    wrapperDiv.appendChild(focusDiv);
}

```

The view then renders the mouse position data by using `renderMousePresence`, which uses the local position map to display the name of each user where they currently are in the window. In the function, the `MouseTracker` instance listens to the `mousePositionChanged` events that are fired every time there is a mouse position change to one of the clients. This triggers the re-render by calling `onPositionChanged` to display the updated mouse positions. The `FocusTracker` instance is also passed in to the function to add bold font to currently focused users:
```typescript
renderMousePresence(mouseTracker, focusTracker, mouseContentDiv);
```
```typescript
function renderMousePresence(mouseTracker: MouseTracker, focusTracker: FocusTracker, div: HTMLDivElement) {
    const onPositionChanged = () => {
      div.innerHTML = "";
      mouseTracker.getMousePresences().forEach((mousePosition, userName) => {
          const posDiv = document.createElement("div");
          posDiv.textContent = userName;
          posDiv.style.position = "absolute";
          posDiv.style.left = `${mousePosition.x}px`;
          posDiv.style.top = `${mousePosition.y}px`;
          if (focusTracker.getFocusPresences().get(userName) === true) {
            posDiv.style.fontWeight = "bold";
          }
          div.appendChild(posDiv);
      });
    };

    onPositionChanged();
    mouseTracker.on("mousePositionChanged", onPositionChanged);
}
```

## Next Steps
- You can find the completed code for this example in the Fluid GitHub repository [here](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/presence-tracker).
- Try extending the `PresenceTracker` to track some other form of presence using signals!

