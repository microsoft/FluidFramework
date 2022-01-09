# @fluid-experimental/react

The Fluid Framework's React package enables React developers to quickly start building large, scalable React apps with synced views powered by Fluid data. It does this by providing a `SyncedDataObject`, Fluid React hooks and a base view class for building React views that use synced states provided by Fluid.

Examples on how to use all of the different tools in this package can be found in the [clicker-react](../../../examples/data-objects/clicker-react) and [`likes`](../../../examples/data-objects/likes) folders under `./examples/data-object/` from the Fluid Framework repo root.

A good general order of operations to follow when writing a `SyncedDataObject` implementation is the following:
1. Define the DDSes needed in the `SyncedDataObject`constructor. This can be done using the `set*Config` functions.
2. Fill in the `render(element: HTMLElement)` function with a call to `ReactDOM.render` and pass in a React view.
3. Build out the React view either using the `FluidReactView` class or as a functional view using the various hooks that are available.

## SyncedDataObject

The ['SyncedDataObject'](./src/syncedDataObject.ts) is an extension of the Fluid `DataObject` class provided by the `@fluidframework/aqueduct` package. This will be the base class that users developing Fluid objects with React views will want to extend.

The `SyncedDataObject` essentially acts as the data store for the React app that is rendered within it. It provides a configuration where we can set up the schema for our data store, and also guarantees that all the values defined in the configuration will be automatically initialized prior to the view rendering. It also ensures that all updates that were made in the data store for that session will be automatically restored when the app is loaded fresh again by another client for that session. Finally, and most importantly, it guarantees that all updates that are made in the data store are synced live with all other clients that are currently viewing this React app in the current session, without requiring event listeners or component lifecycle methods.

`SyncedDataObject` uses the same factory as `DataObject`. However, in addition, it also provides the following functionality:

- A `syncedStateConfig` where users can define the different types of values that they would like to see prepared for their view to consume. Values defined here are guaranteed to be initialized and available prior to `render` being called. Here, users can assign the DDSes that their React views will need by using the pre-built helper functions available to them from the `syncedObjects` folder, i.e. `setSyncedStringConfig`, etc. or they can manually define their own unique configuration with `this.setConfig`. Each value set on the config will have its own `syncedStateId` which we will use to refer to the prepared value from the view.

- A `fluidObjectMap` that guarantees that all Fluid DDSes/objects used by this `SyncedDataObject` will be automatically created and loaded without the need for component lifecycle methods such as `initializeStateFirstTime` and `initializeStateFromExisting`

#### SyncedDataObject Example

```jsx
export class Likes extends SyncedDataObject {
    constructor(props) {
        super(props);
        // Adds a synced counter to config under ID 'likes'
        setSyncedCounterConfig(
            this,
            "likes",
        );
        // Adds a synced string to config under ID 'imgUrl'
        setSyncedStringConfig(
            this,
            "imgUrl",
            defaultImgUrl,
        );
    }
}
```

## syncedObject Hooks

The [synced Objects folder](./src/syncedObjects) contains a collection of setSynced\*Config helper function and useSynced\* hook pairings. These functions allow you to easily start using the DDSes that were prepared in the `syncedDataObject`. Since these are all wrappers around the `React.useState` hook, with added syncing functionality, simply calling these functions using regular React hook rules will automatically convert the function into a React functional view.

Each of these helper & hook pairings take a Fluid DDS and binds them to the `syncedDataObject` under the unique `syncedStateId`. This ensures that any changes that happen on these DDSes see synced updates show up live on all connected React views.

A single `syncedDataObject` can hold multiple different types of DDSes and other `DataObjects` under different `syncedStateIds`. However, each unique ID is exclusive to the type of value that is set there when using the helper & hook pairs.

The current roster of available helper & hook pairs for different DDSes are:
- For just setting type T objects on a `SharedMap` -> `useSyncedObject<T>` & `setSyncedObjectConfig<T>`
- `SharedCounter` -> `useSyncedCounter` & `setSyncedCounterConfig`
- `SharedString` -> `useSyncedString` & `setSyncedStringConfig`

NOTE: IT IS IMPORTANT TO PICK THE RIGHT DDS.

While it may be tempting to use `useSyncedObject` for any type T object, a SharedMap has different syncing logic from a SharedString, etc. Therefore, passing a string to be set on a SharedMap is not the same as using a SharedString. The latter contains additional logic that allows people to, for example, type on the same word together without overwriting one another's characters. Please use `useSyncedString` for these scenarios. The SharedMap, on the other hand, is useful for having a distributed dictionary of items that are always in sync based on the values being set on the map.

### syncedObject Hooks Example

This example provides the view for the `syncedDataObject` in the example above.

```jsx
function LikesView(
    props: ILikesViewProps,
) {
    // Use the synced states that were prepared on our syncedDataObject above using the setSynced*Config helper functions. Note that the useSynced* function and the ID passed in correspond to the how the config was set above. These values are guaranteed to be available in the view
    const [likes, likesReducer] = useSyncedCounter(props.syncedDataObject, "likes");
    const [imgUrl, setImgUrl] = useSyncedString(props.syncedDataObject,"imgUrl");

    // The remaining code is for rendering the React view elements themselves

    // Render
    return (
        <div>
            <div>
                <img width='100%' src={imgUrl?.getText()}/>
                {imgUrl !== undefined
                    ? <CollaborativeInput
                        style={{ width: "90%" }}
                        sharedString={imgUrl}
                        onInput={(value: SharedString) => setImgUrl({ value })}
                    />
                    : undefined}
            </div>
            <span>
                {`Likes: ${likes}`}
            </span>
            <button onClick={() => likesReducer.increment(1)}>
                {"+"}
            </button>
        </div>
    );
}
```

Please note that for every different type of DDS that is used, the initial factory for the data object needs to be updated to include those dependencies. Each DDS only needs to be added to the factory dependency list once, regardless of how many different ways it is used.

I.e. for the example above,
```jsx
// ----- FACTORY SETUP -----
export const LikesInstantiationFactory = new DataObjectFactory(
    "likes",
    Likes,
    [
        SharedCounter.getFactory(),
        SharedString.getFactory(),
    ],
    {},
);
export const fluidExport = LikesInstantiationFactory;
```

These hooks should allow for general functionality to start users off building synced React views using Fluid DDSes. However, if users would like to set up their own custom relationships and configurations, we do also offer the `FluidReactView` base class that extends `React.Component` for classical views, and the `useStateFluid` and `useReducerFluid` hooks for functional views.

## FluidReactView

This is the base level `FluidReactView` that offers a synced view state and a mapping between the view and synced state stored in the root. It allows users to set up their own unique relationships between the Fluid state, which is the data state that is being synced, and the view state, which extracts the synced data from the Fluid state in a format that is ready for consumption in the view. In many cases, these the Fluid and view state can be identical but, in more complex scenarios, it may be beneficial to have a cleaner view state that picks out the relevant values needed for the view from the Fluid state.

To see an example of this, please take a look at the `@fluid-example/clicker-react` example. If we take a look at this example in parts, we can see how the `SyncedDataObject` that houses the view aligns with the `FluidReactView` that is rendered.

Looking at the constructor, we see that a configuration is created under ID `clicker` containing a SharedCounter:
```jsx
    constructor(props) {
        super(props);
        // Mark the counter value in the state as a SharedCounter type and pass in its create function
        // so that it will be created on the first run and be available on our React state
        // We also mark the "incremented" event as we want to update the React state when the counter
        // is incremented to display the new value
        this.setConfig<ICounterState>(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView: new Map([
                    [
                        "counter", {
                            type: SharedCounter.name,
                            viewKey: "counter",
                            sharedObjectCreate: SharedCounter.create,
                            listenedEvents: ["incremented"],
                        },
                    ],
                ]),
                defaultViewState: {},
            },
        );
    }
```

Each `FluidReactView` is bound to its unique state ID and will automatically re-render when any values within the synced state change, without needing any additional event listeners or component lifecycle methods. However, since we are defining our own custom relationships now, we are not limited to only one DDS/Fluid object per `syncedStateId` like we were with the helper & hook pairs above. We can define multiple different DDS/Fluid objects per `syncedStateId` by adding keys to the `fluidToView` map. If we wanted a second counter, the configuration would look like this:

```jsx
this.setConfig<ICounterState>(
    "clicker",
    {
        syncedStateId: "clicker",
        fluidToView: new Map([
            [
                "counter", {
                    type: SharedCounter.name,
                    viewKey: "counter",
                    sharedObjectCreate: SharedCounter.create,
                    listenedEvents: ["incremented"],
                },
                 "counter2", {
                    type: SharedCounter.name,
                    viewKey: "counter2",
                    sharedObjectCreate: SharedCounter.create,
                    listenedEvents: ["incremented"],
                },
            ],
        ]),
        defaultViewState: {},
    },
);
```

This is then passed to the `FluidReactView` in the render function with the `clicker` ID:
```jsx
public render(element: HTMLElement) {
    ReactDOM.render(
        <CounterReactView
            syncedStateId={"clicker"}
            syncedDataObject={this}
        />,
        element,
    );
    return element;
}
```

And now if we look at the view itself, we will see that the state is now pre-loaded with the SharedCounter under the key `counter`, as we defined in the synced state configuration.

```jsx
class CounterReactView extends FluidReactView<CounterViewState, CounterFluidState> {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        return (
            <div>
                <span className="value">
                    {this.state.counter?.value}
                </span>
                <button onClick={() => { this.state.counter?.increment(1); }}>+</button>
            </div>
        );
    }
}
```

This state will automatically update for all clients when `counter?.increment(1)` is called, and trigger a re-render for everyone. No additional event listeners are required.

If we wanted to access our second counter, we can simply do `this.state.counter2?.value`.

## useStateFluid

This is analogous to the React view but as a functional hook. Users can similarly use the returned setState callback to perform synced updates to both their local and synced states.

Some of the `useSynced*` hooks that we discussed above use this underlying call to power their DDS-specifc behavior. It can also be used directly.

## useReducerFluid

This is the hook of choice for larger-scale applications that require more complex mutations, need to work with multiple Fluid objects, and need to have a division between data and view models. Here, instead of having only the view state to manipulate, users have both the view state and the Fluid state, with the former containing primitives used for rendering and the latter containing Fluid views to manipulate data in a synced manner. This hook also introduces the concept of a local FluidObjectMap that stores and listens to changes on already fetched Fluid objects.


Reducers offer ways of mutating the state whereas selectors offer ways of fetching data from other Fluid objects. When either involves the addition of new Fluid objects locally, these are added to the FluidObjectMap so that they can be accessed by the view synchronously.


Any updates to the root state are converted to updates in the view using the provided fluidConverters in the fluidToView map, and vice versa. This allows changes locally to reflect on the root, and root changes to also be translated back to local state updates.

This is currently used to power the `useSyncedCounter` hook, and an example showcasing how to use it is coming soon.

## createContextFluid

This hook is for users who want to be able to easily create a context with provider and consumer that pass the root and initial state through their app.


This hook calls useStateFluid and returns the state and setState values back to be used as part of the initial values passed down by the provider and used by a consumer


Essentially, this allows that portion of the root state to be manipulated through different levels of a React app, giving apps the ability to have multiple different views manipulate the same data not only throughout the app but through all renders of the app on different clients

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
