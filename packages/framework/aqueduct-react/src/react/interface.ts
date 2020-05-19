/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle, IComponentLoadable, IComponent } from "@microsoft/fluid-component-core-interfaces";

export type ViewToFluidMap<SV,SF> = Map<keyof SV, IRootConverter<SV,SF>>;
export type FluidToViewMap<SV,SF> = Map<keyof SF, IViewConverter<SV,SF>>;

export interface FluidProps<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
> {
    root: ISharedDirectory;
    initialViewState: SV,
    initialFluidState: SF,
    fluidComponentMap: FluidComponentMap;
    viewToFluid?: ViewToFluidMap<SV,SF>;
    fluidToView?: FluidToViewMap<SV,SF>;
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
> {
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

export interface FluidSelectorFunction<S, C extends IFluidDataProps,T>{
    function: (state: S, dataProps: C) => T | undefined;
}

export interface FluidComponentSelectorFunction<S, C extends IFluidDataProps, T extends IComponentLoadable>{
    function: (state: S, dataProps: C, handle: IComponentHandle<T>) => T | undefined;
}

export const instanceOfSelectorFunction = <S,C extends IFluidDataProps,T>
(object: any): object is FluidSelectorFunction<S,C,T> =>
    object === Object(object) && "function" in object;

export const instanceOfComponentSelectorFunction = <S,C extends IFluidDataProps, T extends IComponentLoadable>
(object: any): object is FluidComponentSelectorFunction<S,C,T> =>
    object === Object(object) && "function" in object;

export interface FluidReducerProps<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
    A,
    B,
    C extends IFluidDataProps,
> {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    // Required for nested DDS', can be empty or pre-loaded but it needs to be constructed
    // if nested components will be used
    fluidComponentMap: FluidComponentMap,
    initialViewState: SV,
    initialFluidState: SF,
    // All data mutation should be done in reducers
    reducer: A,
    // Any local objects can be fetched directly,
    // any Fluid components need to use a selector to be synchronously fetched with the component map
    selector: B,
    viewToFluid?: ViewToFluidMap<SV,SF>;
    fluidToView?: FluidToViewMap<SV,SF>;
    // Optional param to add to the dataProps being passed to the reducers
    dataProps?: C
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
