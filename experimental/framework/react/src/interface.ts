/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedMap, IValueChanged } from "@fluidframework/map";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
    IFluidHandle,
    IFluidLoadable,
    FluidObject,
} from "@fluidframework/core-interfaces";
import { SyncedDataObject } from "./syncedDataObject";

/**
 * The combined state contains the Fluid and view states and the data props
 * that are passed in to all reducers and selectors
 */
export interface ICombinedState<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    /**
     * The react view state that will be used for all view renders
     */
    viewState: SV;
    /**
     * The Fluid state that will be used to update the synced values in the state. This will be
     * undefined until it is initialized, after which the state will update with the defined values
     */
    fluidState?: SF;
    /**
     * Data props that are loaded in during the Fluid initialization step. This contains the runtime
     * and the Fluid object map, along with any other properties the user wants to pass to reducers
     * and selectors
     */
    dataProps: C;
}

/**
 * The Fluid schema that is generated on load and will be stored in the synced state
 */
export interface IFluidSchema {
    /**
     * (k,v) = (viewKeys, needsFluidConverter)
     */
    viewMatchingMap: ISharedMap;
    /**
     * (k,v) = (fluidKeys, needsViewConverter)
     */
    fluidMatchingMap: ISharedMap;
    /**
     * (k,v) = (path, handle)
     */
    storedHandleMap: ISharedMap;
}

/**
 * A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export type ViewToFluidMap<SV, SF> = Map<keyof SV, IFluidConverter<SV, SF>>;

/**
 * A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export type FluidToViewMap<SV, SF> = Map<keyof SF, IViewConverter<SV, SF>>;

/**
 * The Fluid reducer, containing an object that is keyed by function name and contains state update and
 * effect functions. Each function will have the view state, fluid state, and data props passed into it
 * as parameters in the combined state. State update functions are used to modify values on the state and return
 * the updated state and any new Fluid object handles. Effect functions use values on the state to apply changes
 * elsewhere. They do not return any new objects or state.
 */
export interface IFluidReducer<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    [key: string]:
    | FluidAsyncStateUpdateFunction<SV, SF, C>
    | FluidStateUpdateFunction<SV, SF, C>
    | FluidEffectFunction<SV, SF, C>
    | FluidAsyncEffectFunction<SV, SF, C>;
}

/**
 * The Fluid selector, containing an object that is keyed by function name and contains selector
 * functions. Each function will have the view state, fluid state, and data props passed into it
 * as parameters in the combined state. Selector functions can also optionally pass in a
 * handle to fetch from the Fluid object map.
 * Selector functions are used to retrieve Fluid objects or parameters from other Fluid objects.
 * It offers a way to fetch these values and return them to the view, with the
 * Fluid object map being updated if the view requires a Fluid object that hasn't been locally loaded yet
 */
export interface IFluidSelector<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    [key: string]:
    | FluidSelectorFunction<SV, SF, C>
    | FluidObjectSelectorFunction<SV, SF, C>;
}

/**
 * Props passed in to create a FluidReactView or passed in to the useStateFluid hook
 */
export interface IFluidProps<
    SV extends IViewState,
    SF extends IFluidState
    > {
    /**
     *  Unique ID to use for storing the synced state in the SyncedDataObject's syncedState SharedMap
     */
    syncedStateId: string;
    /**
     * An instance of the SyncedDataObject that this view will be rendered in
     */
    syncedDataObject: SyncedDataObject;
    /**
     * Data props containing the Fluid object map and the runtime
     * Optional as the above two will be passed by default. This only need to be defined
     * if there are additional values from the Fluid object lifecycle that need to be made
     * available to the reducers
     */
    dataProps?: IFluidDataProps;
}

/**
 * View converters to take the synced state Fluid value that they are keyed against in the FluidToView map
 * and convert them into their view state counterparts
 */
export interface IViewConverter<
    SV extends IViewState,
    SF extends IFluidState
    > {
    /**
     * The type of object this key in the Fluid state holds
     */
    type: string;
    /**
     * The corresponding value key within the view state type
     */
    viewKey: keyof SV;
    /**
     * A callback that takes in the partial Fluid state containing the value that
     * this converter maps to, and returns the corresponding partial view state
     */
    viewConverter?: (
        viewState: SV,
        fluidState: Partial<SF>,
        fluidObjectMap: FluidObjectMap
    ) => Partial<SV>;
    /**
     * If this is a fluid DDS SharedObject type (i.e. SharedCounter, SharedMap), supply its create function
     * here and add any events that it will fire to the listenedEvents param below to trigger state updates
     */
    sharedObjectCreate?: (runtime: IFluidDataStoreRuntime) => any;
    /**
     * List of events fired on this Fluid object that will trigger a state update
     */
    listenedEvents?: string[];
    /**
     * If this Fluid object is stored on the Fluid DataObject root under a different key
     * than the name of this Fluid state key within the synced state map,
     * provide the key on the root for this object here. The changes will also
     * reflect under that key if the data needs to be used elsewhere
     */
    rootKey?: string;
}

/**
 * Fluid converters to take the view state value that they are keyed against in the ViewToFluid map
 * and convert them into their synced Fluid state counterparts
 */
export interface IFluidConverter<
    SV extends IViewState,
    SF extends IFluidState
    > {
    /**
     * The type of object this key in the view state holds
     */
    type: string;
    /**
     * The corresponding value within the Fluid state
     */
    fluidKey: keyof SF;
    /**
     * A callback that takes in the partial view state containing the value that
     * this converter maps to, and optionally returns a value. This value will be automatically set on the synced state
     * under the view key this converter maps to
     */
    fluidConverter?: (viewState: SV, fluidState: Partial<SF>) => any;
}

/**
 * Base interface to extend from for the Fluid state. These values can and should be left
 * undefined when passing in the initial state as they will be used to establish the Fluid state
 */
export interface IFluidState {
    /**
     * The unique state ID for this React Fluid view
     */
    syncedStateId?: string;
    /**
     * Boolean indicating if any DDSes or Fluid objects on this state are being listened on
     * for synced state updates to trigger React state updates
     */
    isInitialized?: boolean;
}

/**
 * Base interface to extend from for the view state.
 * This should be crafted based off of what the view will use from the Fluid state.
 */
export interface IViewState
    extends IFluidState {
    /**
     * The map containing the locally available Fluid objects that have been loaded. If there are
     * any Fluid objects loaded during initialization that the view needs to use,
     * they should be fetched and loaded in here.
     * Any new Fluid objects added through reducers/selectors during the React lifecycle
     * will be automatically added to this map and the state will re-update when they become asynchronously available
     */
    fluidObjectMap?: FluidObjectMap;
}

export type IFluidReactState = IFluidState & IViewState;

export const instanceOfIFluidLoadable = (
    object: any,
): object is IFluidLoadable =>
    object === Object(object) && "IFluidLoadable" in object;

/**
 * The values stored in the Fluid object map
 */
export interface IFluidObjectMapItem {
    /**
     * The actual Fluid object that the path this value is keyed against leads to
     */
    fluidObject?: FluidObject & IFluidLoadable;
    /**
     * Boolean indicating if we are listening to changes on this Fluid object's synced state to trigger React
     * state updates. Only set if you want custom behavior for adding listeners to your Fluid state
     */
    isListened?: boolean;
    /**
     * List of events fired on this Fluid object that will trigger a state update
     */
    listenedEvents?: string[];
    /**
     * INTERNAL
     * Does not need to be set
     * Is this a SharedMap that was added as a Fluid React requirement
     */
    isRuntimeMap?: boolean;
}

/**
 * A map of the Fluid object handle absolute path to the Fluid object
 */
export type FluidObjectMap = Map<string, IFluidObjectMapItem>;

/**
 * Base interface to extend from for the data props that will be passed in for reducers and
 * selectors to use to offer inter-Fluid object operability
 */
export interface IFluidDataProps {
    /**
     * The Fluid data store runtime passed in from Fluid object initialization
     */
    runtime: IFluidDataStoreRuntime;
    /**
     * The running map of all the Fluid objects being used to render the React view. This
     * can be view/data Fluid objects, and they will be asynchronously loaded here so that they are,
     * in turn, synchronously available for the view when the state updates after they are fetched
     */
    fluidObjectMap: FluidObjectMap;
}

/**
 * Definition for an effect function used in reducers
 */
export interface FluidEffectFunction<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    /**
     * The function defined here will take the combined state and apply some
     * logic that does not cause any state update changes
     */
    function: (oldState?: ICombinedState<SV, SF, C>, ...args: any) => void;
}

export const instanceOfEffectFunction = <
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidEffectFunction<SV, SF, C> =>
    object === Object(object) && "function" in object;

/**
 * Definition for an async effect function used in reducers
 */
export interface FluidAsyncEffectFunction<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    /**
     *  The function defined here will take the combined state and apply some
     * async logic that does not cause any state update changes
     */
    asyncFunction: (
        oldState?: ICombinedState<SV, SF, C>,
        ...args: any
    ) => Promise<void>;
}

export const instanceOfAsyncEffectFunction = <
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidAsyncEffectFunction<SV, SF, C> =>
    object === Object(object) && "asyncFunction" in object;

/**
 * Definition for a state update function used in reducers
 */
export interface FluidStateUpdateFunction<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    /**
     * The function defined here will take the combined state and update either
     * the Fluid state, the view state, or both. The new combined state and any new Fluid object
     * handles to load in are returned by the function.
     */
    function: (
        oldState?: ICombinedState<SV, SF, C>,
        ...args: any
    ) => IStateUpdateResult<SV, SF, C>;
}

export const instanceOfStateUpdateFunction = <
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidStateUpdateFunction<SV, SF, C> =>
    object === Object(object) && "function" in object;

/**
 * Definition for an async state update function used in reducers
 */
export interface FluidAsyncStateUpdateFunction<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    /**
     * The function defined here will take the combined state and update either
     * the Fluid state, the view state, or both in an async manner. The new combined state and any new
     * Fluid object handles to load in will be returned by the function when it finishes.
     */
    asyncFunction: (
        oldState?: ICombinedState<SV, SF, C>,
        ...args: any
    ) => Promise<IStateUpdateResult<SV, SF, C>>;
}

/**
 * The value returned by state update functions.
 */
export interface IStateUpdateResult<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    /**
     * The new view and Fluid states that were updated by the function
     */
    state: ICombinedState<SV, SF, C>;
    /**
     * Any new Fluid objects that were added in due this function need to have
     * their corresponding handles passed in so that the object can also be loaded for all other users
     */
    newFluidHandles?: IFluidHandle[];
}

export const instanceOfAsyncStateUpdateFunction = <
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidAsyncStateUpdateFunction<SF, SV, C> =>
    object === Object(object) && "asyncFunction" in object;

/**
 * Definition for a selector function used in selectors
 */
export interface FluidSelectorFunction<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    /**
     * The function defined here will take the combined state and return
     * to the view any values that it needs  from other values/Fluid objects that were passed
     * in to the data props on initializing.
     * It will also return any new Fluid handles that will be needed for other users to render the view value
     */
    function: (
        state?: ICombinedState<SV, SF, C>
    ) => {
        result: any | undefined;
        newFluidHandles?: IFluidHandle[];
    };
}

/**
 * Definition for a Fluid object selector function used in selectors
 */
export interface FluidObjectSelectorFunction<
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
    > {
    /**
     * Similar to the FluidSelectorFunction's function but this also takes in a
     * handle if we need to fetch a Fluid object from the fluidObjectMap
     */
    function: (
        handle: IFluidHandle<any>,
        state?: ICombinedState<SV, SF, C>,
    ) => {
        result: FluidObject | undefined;
        newFluidHandles?: IFluidHandle[];
    };
}

export const instanceOfSelectorFunction = <
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidSelectorFunction<SV, SF, C> =>
    object === Object(object) && "function" in object;

export const instanceOfFluidObjectSelectorFunction = <
    SV extends IViewState,
    SF extends IFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidObjectSelectorFunction<SV, SF, C> =>
    object === Object(object) && "function" in object;

/**
 * Props passed in to the useReducerFluid hook
 */
export interface IFluidReducerProps<
    SV extends IViewState,
    SF extends IFluidState,
    A extends IFluidReducer<SV, SF, C>,
    B,
    C extends IFluidDataProps
    > {
    /**
     * Unique ID to use for storing the view's synced state in the SyncedDataObject's syncedState SharedMap
     */
    syncedStateId: string;
    /**
     * An instance of the SyncedDataObject that this will be rendered in
     */
    syncedDataObject: SyncedDataObject;
    /**
     * The Fluid reducer containing all the functions as defined by an extension of the IFluidReducer type.
     * Any mutations to the state, or effects outside of the Fluid object involving the state should be done here.
     */
    reducer: A;
    /**
     * The Fluid selector containing all the functions as defined by an extension of the IFluidSelector
     * type. Any fetching of new Fluid objects or data from other Fluid objects should be done here.
     */
    selector: B;
    /**
     * Data props that are loaded in during the Fluid initialization step. This contains the runtime
     * and the Fluid object map
     * TODO: Move data props out as it can be fetched from synced Fluid data object but
     * still needs to be extensible for reducers
     */
    dataProps?: C;
}

/**
 * Props containing the context that will be passed down through the Fluid context provider to the consumer
 */
export interface IFluidContextProps<SV, SF, C> extends IFluidProps<SV, SF> {
    /**
     * The additional data that will be passed through the Fluid context
     */
    reactContext?: C;
}

/**
 * The state that is available through the react context
 */
export interface FluidContextState<
    SV extends IViewState,
    C
    > {
    /**
     * The view state
     */
    state: SV;
    /**
     * Callback to update the state
     */
    setState: (state: SV) => void;
    /**
     * The context passed in from the props
     */
    reactContext: Partial<C>;
}

/**
 * The returned value of createFluidContext
 */
export interface FluidContext<
    SV extends IViewState,
    C
    > {
    /**
     * The context provider React component that will give the FluidContextState to
     * its children
     */
    Provider: React.ProviderExoticComponent<
        React.ProviderProps<FluidContextState<SV, C>>
    >;
    /**
     * The context consumer that allows children to use the FluidContextState
     */
    Consumer: React.Consumer<FluidContextState<SV, C>>;
    /**
     * Callback to get the context
     */
    usePrimedContext: () => FluidContextState<SV, C>;
    /**
     * The view state
     */
    state: SV;
    /**
     * Callback to update the state
     */
    setState: (newState: SV) => void;
}

export interface ISyncedStateConfig<SV, SF> {
    /**
     * Unique ID to use for storing the view's synced state in the SyncedDataObject's syncedState SharedMap
     */
    syncedStateId: string;
    /**
     * The backup default view that any view with this ID will use prior to Fluid state initializing, this can be
     * overridden by the view developer themselves
     */
    defaultViewState: SV;
    /**
     * A map of the Fluid state values that need conversion to their view state counterparts and the
     * respective converters
     */
    fluidToView: FluidToViewMap<SV, SF>;
    /**
     * A map of the view state values that need conversion to their Fluid state counterparts and the
     * respective converters
     */
    viewToFluid?: ViewToFluidMap<SV, SF>;
}

/**
 * The configurations that define the relationships between Fluid and view states for
 * views that are rendered in a SyncedDataObject
 */
export type SyncedStateConfig = Map<string, ISyncedStateConfig<any, any>>;

/**
 * The interface for interacting with the synced state that is stored on a SyncedDataObject
 */
export interface ISyncedState {
    /**
     * Set values on the synced state for a syncedStateId as key
     */
    set: (key: string, value: any) => void;
    /**
     * Get values from the synced state for a syncedStateId as key
     */
    get: <T>(key: string) => T | undefined;
    /**
     * Add a listener to the synced state using a provided callback
     */
    addValueChangedListener: (
        callback: (changed: IValueChanged, local: boolean) => void) => void;
}
