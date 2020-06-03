/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedDirectory, ISharedMap } from "@fluidframework/map";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { IComponentHandle, IComponentLoadable, IComponent } from "@fluidframework/component-core-interfaces";

/**
 * The combined state contains the fluid and view states and the data props
 * that are passed in to all reducers and selectors
 * @param viewState - The react view state that will be used for all view renders
 * @param fluidState - The fluid state that will be used to update the synced values in the state
 * @param dataProps  - Data props that are loaded in during the Fluid initialization step. This contains the runtime
 * and the fluid component map
 */
export interface ICombinedState<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
> {
    viewState: SV,
    fluidState: SF,
    dataProps: C,
}

/**
 * The fluid schema that is generated on load and will be stored in the root
 * @param componentKeyMap - (k,v) = (common fluid and view state component keys, respective handles)
 * @param viewMatchingMap - (k,v) = (viewKeys, needsFluidConverter)
 * @param fluidMatchingMap - (k,v) = (fluidKeys, needsViewConverter)
 * and the fluid component map
 */
export interface IFluidSchema {
    componentKeyMap: ISharedMap,
    viewMatchingMap: ISharedMap,
    fluidMatchingMap: ISharedMap,
}

/**
 * The respective handles for the fluid schema params listed above
 */
export interface IFluidSchemaHandles {
    componentKeyMapHandle?: IComponentHandle<ISharedMap>,
    viewMatchingMapHandle?: IComponentHandle<ISharedMap>,
    fluidMatchingMapHandle?: IComponentHandle<ISharedMap>,
}

/**
 * A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export type ViewToFluidMap<SV,SF> = Map<keyof SV, IFluidConverter<SV,SF>>;

/**
 * A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export type FluidToViewMap<SV,SF> = Map<keyof SF, IViewConverter<SV,SF>>;

/**
 * The fluid reducer, containing an object that is keyed by function name and contains state update and
 * effect functions. Each function will have the view state, fluid state, and data props passed into it
 * as parameters in the combined state. State update functions are used to modify values on the state and return
 * the updated state and any new component handles. Effect functions use values on the state to apply changes
 * elsewhere. They do not return any new components or state.
 */
export interface IFluidReducer<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
> {
    [key: string]: FluidAsyncStateUpdateFunction<SV,SF,C>
    | FluidStateUpdateFunction<SV,SF,C>
    | FluidEffectFunction<SV,SF,C>
    | FluidAsyncEffectFunction<SV,SF,C>;
}

/**
 * The fluid selector, containing an object that is keyed by function name and contains selector
 * functions. Each function will have the view state, fluid state, and data props passed into it
 * as parameters in the combined state. Component selector functions can also optionally pass in a
 * handle to fetch from the component map. Selector functions are used to retrieve components or parameters
 * from other components. It offers a way to fetch these values and return them to the view, with the
 * component map being updated if the view requires a component that hasn't been locally loaded yet
 */
export interface IFluidSelector<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
> {
    [key: string]: FluidSelectorFunction<SV,SF,C> | FluidComponentSelectorFunction<SV,SF,C>;
}

/**
 * Props passed in to create a fluid react component or passed in to the useStateFluid hook
 * @param syncedStateId - Unique ID to use for storing the component's synced state in the root
 * @param root - The root shared directory that will be used to store the synced state
 * @param initialViewState - The React initial state to use for the first render
 * @param initialFluidState - The Fluid state loaded during the Fluid initialization step before rendering
 * @param dataProps - Data props that are loaded in during the Fluid initialization step. This contains the runtime
 * and the fluid component map
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export interface IFluidProps<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
> {
    syncedStateId: string,
    root: ISharedDirectory,
    initialViewState: SV,
    initialFluidState: SF,
    dataProps: IFluidDataProps,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
}

/**
 * View converters to take the synced state Fluid value that they are keyed against in the FluidToView map
 * and convert them into their view state counterparts
 * @param stateKey - The corresponding value key within the view state type, only needs to be provided if different
 * from the fluidKey
 * @param viewConverter - A callback that takes in the partial view state containing the value that
 * this converter maps to, and returns the corresponding partial fluid state
 * @param fluidObjectType - If this is a special fluid object type (i.e. counter) on the root, specify that here
 * @param rootKey - If this Fluid object is stored on the root under a different key than the name of this Fluid state
 * key, provide the key on the root for this object here
 */
export interface IViewConverter<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
>{
    stateKey?: keyof SV,
    viewConverter?: (syncedState: Partial<SF>, fluidComponentMap: FluidComponentMap) => Partial<SV>,
    fluidObjectType?: string;
    rootKey?: string;
}

/**
 * Root converters to take the view state value that they are keyed against in the ViewToFluid map
 * and convert them into their synced Fluid state counterparts
 * @param fluidKey - The corresponding value within the Fluid state
 * @param fluidConverter - A callback that takes in the partial Fluid state containing the value that
 * this converter maps to, and returns the corresponding partial view state
 */
export interface IFluidConverter<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
> {
    fluidKey: keyof SF,
    fluidConverter?: (viewState: Partial<SV>) => Partial<SF>,
}

/**
 * Base interface to extend from for the functional component Fluid state. These values can and should be left
 * undefined when passing in the initial state as they will be used to establish the Fluid state
 * @param syncedStateId - The unique state ID for this React Fluid component
 * @param isInitialized - Boolean indicating if any components on this state are being listened on
 * for root updates to trigger React state updates
 */
export interface IFluidFunctionalComponentFluidState {
    syncedStateId?: string;
    isInitialized?: boolean;
}

/**
 * Base interface to extend from for the functional component view state. This should not contain any Fluid
 * components and should be crafted based off of what the view will use.
 * @param fluidComponentMap - The map containing the locally available components that have been loaded. If there are
 * any components loaded during initialization that the view needs to use, they should be fetched and loaded in here.
 * Any new components added through reducers/selectors during the React lifecycle
 * will be automatically added to this map and the state will reupdate when they become asynchronously available
 */
export interface IFluidFunctionalComponentViewState extends IFluidFunctionalComponentFluidState {
    fluidComponentMap?: FluidComponentMap;
}

export const instanceOfIComponentLoadable = (object: any): object is IComponentLoadable =>
    object === Object(object) && "IComponentLoadable" in object;

/**
 * The values stored in the fluid component map
 * @param component - The actual Fluid component that the path this value is keyed against leads to
 * @param isListened - Boolean indicating if we are listening to changes on this component's root to trigger React
 * @param isRuntimeMap - Is this a SharedMap that was added as a Fluid React requirement
 * state updates
 */
export interface IFluidComponent {
    component?: IComponent & IComponentLoadable,
    isListened?: boolean,
    isRuntimeMap?: boolean,
}

/**
 * A map of the component handle path to the Fluid component object
 */
export type FluidComponentMap = Map<string, IFluidComponent>;

/**
 * Base interface to extend from for the data props that will be passed in for reducers and
 * selectors to use to offer inter-component operability
 */
export interface IFluidDataProps {
    runtime: IComponentRuntime,
    fluidComponentMap: FluidComponentMap,
}

/**
 * Definition for an effect function used in reducers
 * @param function - The function defined here will take the combined state and apply some
 * logic that does not cause any state update changes
 */
export interface FluidEffectFunction<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
>{
    function: (oldState: ICombinedState<SV,SF,C>, ...args: any) => void;
}

export const instanceOfEffectFunction = <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidEffectFunction<SV,SF,C> =>
    object === Object(object) && "function" in object;

/**
 * Definition for an async effect function used in reducers
 * @param function - The function defined here will take the combined state and apply some
 * async logic that does not cause any state update changes
 */
export interface FluidAsyncEffectFunction<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
>{
    function: (oldState: ICombinedState<SV,SF,C>, ...args: any) => Promise<void>;
}

export const instanceOfAsyncEffectFunction = <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidAsyncEffectFunction<SV,SF,C> =>
    object === Object(object) && "function" in object;

/**
 * Definition for a state update function used in reducers
 * @param function - The function defined here will take the combined state and update either
 * the fluid state, the view state, or both. The new combined state and any new component handles
 * to load in are returned by the function.
 */
export interface FluidStateUpdateFunction<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps> {
    function: (
        oldState: ICombinedState<SV,SF,C>,
        ...args: any
    ) => IStateUpdateResult<SV,SF,C>;
}

export const instanceOfStateUpdateFunction = <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps>(
    object: any,
): object is FluidStateUpdateFunction<SV,SF,C> =>
    object === Object(object) && "function" in object;

/**
 * Definition for an async state update function used in reducers
 * @param asyncFunction - The function defined here will take the combined state and update either
 * the fluid state, the view state, or both in an async manner. The new combined state and any new
 * component handles to load in will be returned by the function when it finishes.
 */
export interface FluidAsyncStateUpdateFunction<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
>{
    asyncFunction: (
        oldState: ICombinedState<SV,SF,C>,
        ...args: any
    ) => Promise<IStateUpdateResult<SV,SF,C>>;
}

/**
 * The value returned by state update functions.
 * @param state - The new view and fluid states that were updated by the function
 * @param newComponentHandles - Any new components that were added in due this function need to have
 * their corresponding handles passed in so that the object can also be loaded for all other users
 */
export interface IStateUpdateResult<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
> {
    state: ICombinedState<SV,SF,C>,
    newComponentHandles?: IComponentHandle[],
}

export const instanceOfAsyncStateUpdateFunction = <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidAsyncStateUpdateFunction<SF,SV,C> =>
    object === Object(object) && "asyncFunction" in object;

/**
 * Definition for a selector function used in selectors
 * @param function - The function defined here will take the combined state and return
 * to the view any values that it needs  from other values/components that were passed
 * in to the data props on initializing.
 * It will also return any new component handles that will be needed for other users to render the view value
 */
export interface FluidSelectorFunction<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
>{
    function: (state: ICombinedState<SV,SF,C>) => {
        result: any | undefined,
        newComponentHandles?: IComponentHandle[]
    }
}

/**
 * Definition for a component selector function used in selectors
 * @param function - Similar to the FluidSelectorFunction's function but this also takes in a
 * handle if we need to fetch a component from the fluidComponentMap
 */
export interface FluidComponentSelectorFunction<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
>{
    function: (state: ICombinedState<SV,SF,C>, handle: IComponentHandle<any>) => {
        result: IComponent | undefined,
        newComponentHandles?: IComponentHandle[]
    }
}

export const instanceOfSelectorFunction = <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
> (object: any): object is FluidSelectorFunction<SV,SF,C> =>
    object === Object(object) && "function" in object;

export const instanceOfComponentSelectorFunction = <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
> (object: any): object is FluidComponentSelectorFunction<SV,SF,C> =>
    object === Object(object) && "function" in object;

/**
 * Props passed in to the useReducerFluid hook
 * @param syncedStateId - Unique ID to use for storing the component's synced state in the root
 * @param root - The root shared directory that will be used to store the synced state
 * @param initialViewState - The React initial state to use for the first render
 * @param initialFluidState - The Fluid state loaded during the Fluid initialization step before rendering
 * @param reducer - The Fluid reducer containing all the functions as defined by an extension of the IFluidReducer type.
 * Any mutations to the state, or effects outside of the component involving the state should be done here.
 * @param selector - The Fluid selector containing all the functions as defined by an extension of the IFluidSelector
 * type. Any fetching of new components or data from other components should be done here.
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param dataProps - Data props that are loaded in during the Fluid initialization step. This contains the runtime
 * and the fluid component map
 */
export interface IFluidReducerProps<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    A extends  IFluidReducer<SV,SF,C>,
    B,
    C extends IFluidDataProps,
> {
    syncedStateId: string,
    root: ISharedDirectory,
    initialViewState: SV,
    initialFluidState: SF,
    reducer: A,
    selector: B,
    viewToFluid?: ViewToFluidMap<SV,SF>;
    fluidToView?: FluidToViewMap<SV,SF>;
    dataProps: C
}

/**
 * Props containing the context that will be passed down through the Fluid context provider to the consumer
 * @param reactContext - The additional data that will be passed through the Fluid context
 */
export interface IFluidContextProps<SV,SF,C> extends IFluidProps<SV,SF> {
    reactContext: Partial<C>
}

/**
 * The state that is available through the react context
 * @param state - The view state
 * @param setState - Callback to update the state
 * @param reactContext - The context passed in from the props
 */
export interface FluidContextState<SV extends IFluidFunctionalComponentViewState,C> {
    state: SV,
    setState: (state: SV, fromRootUpdate?: boolean) => void,
    reactContext: Partial<C>
}

/**
 * The returned value of createFluidContext
 * @param Provider - The context provider component that will give the FluidContextState to
 * its children
 * @param Consumer - The context consumer that allows children to use the FluidContextState
 * @param usePrimedContext - Callback to get the context
 * @param state - The view state
 * @param setState - Callback to update the state
 */
export interface FluidContext<SV extends IFluidFunctionalComponentViewState,C> {
    Provider: React.ProviderExoticComponent<React.ProviderProps<FluidContextState<SV,C>>>,
    Consumer: React.Consumer<FluidContextState<SV,C>>,
    usePrimedContext: () => FluidContextState<SV,C>,
    state: SV,
    setState: (newState: SV) => void,
}
