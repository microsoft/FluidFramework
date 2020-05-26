/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedDirectory, ISharedMap } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle, IComponentLoadable, IComponent } from "@microsoft/fluid-component-core-interfaces";

export interface ICombinedState<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
> {
    viewState: SV,
    fluidState: SF,
    dataProps: C,
}

export interface IFluidSchema {
    // (k,v) => (common fluid and view keys, handles)
    componentKeyMap: ISharedMap,
    // (k,v) => (viewKeys, needsRootConverter)
    viewMatchingMap: ISharedMap,
    // (k,v) => (fluidKeys, needsViewConverter)
    fluidMatchingMap: ISharedMap,
}

export interface IFluidSchemaHandles {
    componentKeyMapHandle?: IComponentHandle<ISharedMap>,
    viewMatchingMapHandle?: IComponentHandle<ISharedMap>,
    fluidMatchingMapHandle?: IComponentHandle<ISharedMap>,
}

export type ViewToFluidMap<SV,SF> = Map<keyof SV, IRootConverter<SV,SF>>;
export type FluidToViewMap<SV,SF> = Map<keyof SF, IViewConverter<SV,SF>>;

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

export interface IFluidSelector<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    C extends IFluidDataProps
> {
    [key: string]: FluidSelectorFunction<SV,SF,C> | FluidComponentSelectorFunction<SV,SF,C>;
}

export interface FluidProps<
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

export interface IViewConverter<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
>{
    stateKey: keyof SV,
    viewConverter: (syncedState: Partial<SF>, fluidComponentMap: FluidComponentMap) => Partial<SV>,
    fluidObjectType?: string;
    rootKey?: string;
}

export interface IRootConverter<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
> {
    rootKey: keyof SF,
    rootConverter?: (viewState: Partial<SV>) => Partial<SF>,
}

export interface IFluidFunctionalComponentFluidState {
    syncedStateId?: string;
    isInitialized?: boolean;
}

export interface IFluidFunctionalComponentViewState extends IFluidFunctionalComponentFluidState {
    fluidComponentMap?: FluidComponentMap;
}

export const instanceOfIComponentLoadable = (object: any): object is IComponentLoadable =>
    object === Object(object) && "IComponentLoadable" in object;

export interface IFluidComponent {
    component?: IComponent & IComponentLoadable,
    isListened?: boolean,
}

export type FluidComponentMap = Map<string, IFluidComponent>;

export interface IFluidDataProps {
    runtime: IComponentRuntime,
    fluidComponentMap: FluidComponentMap,
}

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
    // All data mutation should be done in reducers
    reducer: A,
    // Any local objects can be fetched directly,
    // any Fluid components need to use a selector to be synchronously fetched with the component map
    selector: B,
    viewToFluid?: ViewToFluidMap<SV,SF>;
    fluidToView?: FluidToViewMap<SV,SF>;
    // Param to add to the dataProps being passed to the reducers
    // Only requirements here are that a runtime and an empty initialized Map be provided
    dataProps: C
}

export interface IFluidContextProps<SV,SF,C> extends FluidProps<SV,SF> {
    reactContext: Partial<C>
}

export interface FluidContextState<SV extends IFluidFunctionalComponentViewState,C> {
    state: SV,
    setState: (state: SV, fromRootUpdate?: boolean) => void,
    reactContext: Partial<C>
}

export interface FluidContext<SV extends IFluidFunctionalComponentViewState,C> {
    Provider: React.ProviderExoticComponent<React.ProviderProps<FluidContextState<SV,C>>>,
    Consumer: React.Consumer<FluidContextState<SV,C>>,
    usePrimedContext: () => FluidContextState<SV,C>,
    state: SV,
    setState: (newState: SV) => void,
}
