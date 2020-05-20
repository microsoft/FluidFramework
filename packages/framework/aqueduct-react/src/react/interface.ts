/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedDirectory, ISharedMap } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle, IComponentLoadable, IComponent } from "@microsoft/fluid-component-core-interfaces";

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

export interface IFluidReducer<S,C extends IFluidDataProps> {
    [key: string]: FluidAsyncStateUpdateFunction<S,C> | FluidStateUpdateFunction<S,C>;
}

export interface IFluidSelector<S,C extends IFluidDataProps> {
    [key: string]: FluidSelectorFunction<S,C> | FluidComponentSelectorFunction<S,C>;
}

export interface FluidProps<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
> {
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
}

export interface IRootConverter<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
> {
    rootKey: keyof SF,
    rootConverter?: (viewState: Partial<SV>) => Partial<SF>,
}

export interface IFluidFunctionalComponentFluidState {
    isInitialized?: boolean;
}

export interface IFluidFunctionalComponentViewState extends IFluidFunctionalComponentFluidState {
    fluidComponentMap?: FluidComponentMap;
}

export const instanceOfIComponentLoadable = (object: any): object is IComponentLoadable =>
    object === Object(object) && "IComponentLoadable" in object;

export interface IFluidComponent {
    component: IComponent & IComponentLoadable,
    isListened?: boolean,
}

export type FluidComponentMap = Map<IComponentHandle, IFluidComponent>;

export interface IFluidDataProps {
    runtime: IComponentRuntime,
    // Required for nested DDS', can be empty or pre-loaded but it needs to be constructed
    // if nested components will be used
    fluidComponentMap: FluidComponentMap,
}

export interface FluidEffectFunction<S, C extends IFluidDataProps> {
    function: (oldState: S, dataProps: C, ...args: any) => void;
}

export const instanceOfEffectFunction = <S, C extends IFluidDataProps>(
    object: any,
): object is FluidEffectFunction<S, C> =>
    object === Object(object) && "function" in object;

export interface FluidAsyncEffectFunction<S, C extends IFluidDataProps> {
    function: (oldState: S, dataProps: C, ...args: any) => Promise<void>;
}

export const instanceOfAsyncEffectFunction = <S, C extends IFluidDataProps>(
    object: any,
): object is FluidAsyncEffectFunction<S, C> =>
    object === Object(object) && "function" in object;

export interface FluidStateUpdateFunction<S extends IFluidFunctionalComponentViewState, C extends IFluidDataProps> {
    function: (oldState: S, dataProps: C, ...args: any) => IStateUpdateResult<S>;
}

export const instanceOfStateUpdateFunction = <S extends IFluidFunctionalComponentViewState, C extends IFluidDataProps>(
    object: any,
): object is FluidStateUpdateFunction<S, C> =>
    object === Object(object) && "function" in object;

export interface FluidAsyncStateUpdateFunction<
    S extends IFluidFunctionalComponentViewState,
    C extends IFluidDataProps
>{
    function: (oldState: S, dataProps: C, ...args: any) => Promise<IStateUpdateResult<S>>;
}

export interface IStateUpdateResult<S extends IFluidFunctionalComponentViewState> {
    state: S,
    newComponentHandles?: IComponentHandle[],
}

export const instanceOfAsyncStateUpdateFunction = <
    S extends IFluidFunctionalComponentViewState,
    C extends IFluidDataProps
>(
    object: any,
): object is FluidAsyncStateUpdateFunction<S,C> =>
    object === Object(object) && "function" in object;

export interface FluidSelectorFunction<S, C extends IFluidDataProps>{
    function: (state: S, dataProps: C) => any | undefined;
}

export interface FluidComponentSelectorFunction<S, C extends IFluidDataProps>{
    function: (state: S, dataProps: C, handle: IComponentHandle<any>) => IComponent | undefined;
}

export const instanceOfSelectorFunction = <S,C extends IFluidDataProps>
(object: any): object is FluidSelectorFunction<S,C> =>
    object === Object(object) && "function" in object;

export const instanceOfComponentSelectorFunction = <S,C extends IFluidDataProps>
(object: any): object is FluidComponentSelectorFunction<S,C> =>
    object === Object(object) && "function" in object;

export interface FluidReducerProps<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    A,
    B,
    C extends IFluidDataProps,
> {
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

export interface FluidContextProps<SV,SF,C> extends FluidProps<SV,SF> {
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
