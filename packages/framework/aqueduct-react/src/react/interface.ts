/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle, IComponentLoadable, IComponent } from "@microsoft/fluid-component-core-interfaces";

export interface FluidProps<P, S> {
    root: ISharedDirectory;
    initialState: S,
    fluidComponentMap: FluidComponentMap;
    stateToRoot?: Map<keyof S, string>,
}

export interface FluidFunctionalComponentState {
    fluidComponentMap?: FluidComponentMap;
    isInitialized?: boolean;
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

export interface FluidStateUpdateFunction<S extends FluidFunctionalComponentState, C extends IFluidDataProps> {
    function: (oldState: S, dataProps: C, ...args: any) => IStateUpdateResult<S>;
}

export const instanceOfStateUpdateFunction = <S extends FluidFunctionalComponentState, C extends IFluidDataProps>(
    object: any,
): object is FluidStateUpdateFunction<S, C> =>
    object === Object(object) && "function" in object;

export interface FluidAsyncStateUpdateFunction<S extends FluidFunctionalComponentState, C extends IFluidDataProps> {
    function: (oldState: S, dataProps: C, ...args: any) => Promise<IStateUpdateResult<S>>;
}

export interface IStateUpdateResult<S extends FluidFunctionalComponentState> {
    state: S,
    newComponentHandles?: IComponentHandle[],
}

export const instanceOfAsyncStateUpdateFunction = <S, C extends IFluidDataProps>(
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

export interface FluidReducerProps<S extends FluidFunctionalComponentState, A, B, C extends IFluidDataProps> {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    // Required for nested DDS', can be empty or pre-loaded but it needs to be constructed
    // if nested components will be used
    fluidComponentMap: FluidComponentMap,
    initialState: S,
    // All data mutation should be done in reducers
    reducer: A,
    // Any local objects can be fetched directly,
    // any Fluid components need to use a selector to be synchronously fetched
    selector: B,
    stateToRoot?: Map<keyof S, string>,
    // Optional param to add to the dataProps being passed to the reducers
    dataProps?: C
}

export interface FluidContextProps<P,S,C> extends FluidProps<P,S> {
    reactContext: Partial<C>
}

export interface FluidContextState<S,C> {
    state: S,
    setState: (state: S) => void,
    reactContext: Partial<C>
}

export interface FluidContext<S,C> {
    Provider: React.ProviderExoticComponent<React.ProviderProps<FluidContextState<S,C>>>,
    Consumer: React.Consumer<FluidContextState<S,C>>,
    usePrimedContext: () => FluidContextState<S,C>,
    state: S,
    setState: (newState: S) => void,
}
