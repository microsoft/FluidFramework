/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";

export interface FluidProps<P, S> {
    root: ISharedDirectory;
    initialState: S,
    stateToRoot?: Map<keyof S, string>,
    handleMap?: HandleMap;
}

export interface FluidFunctionalComponentState {
    handleMap?: HandleMap;
    isInitialized?: boolean;
}

export const instanceOfIComponentLoadable = (object: any): object is IComponentLoadable =>
    object === Object(object) && "IComponentLoadable" in object;

export type HandleMap = Map<IComponentHandle, IComponentLoadable>;

export interface IFluidDataProps {
    runtime: IComponentRuntime,
    handleMap: HandleMap,
}

export interface FluidStateUpdateFunction<S> {
    function: (oldState: S, dataProps: IFluidDataProps, ...args: any) => S;
}

export const instanceOfStateUpdateFunction = <S,>(object: any): object is FluidStateUpdateFunction<S> =>
    object === Object(object) && "function" in object;

export interface FluidAsyncStateUpdateFunction<S> {
    function: (oldState: S, dataProps: IFluidDataProps, ...args: any) => Promise<S>;
}

export const instanceOfAsyncStateUpdateFunction = <S,>(object: any): object is FluidAsyncStateUpdateFunction<S> =>
    object === Object(object) && "function" in object;

export interface FluidSelectorFunction<S, T>{
    function: (state: S, dataProps: IFluidDataProps, handle: IComponentHandle<T>) => T | undefined;
}

export const instanceOfSelectorFunction = <S,T,>(object: any): object is FluidSelectorFunction<S,T> =>
    object === Object(object) && "function" in object;

export interface FluidReducerProps<S extends FluidFunctionalComponentState, A, B> {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    initialState: S,
    reducer: A,
    selector: B,
    stateToRoot?: Map<keyof S, string>,
    // Needed for nested DDS'
    handleMap?: HandleMap,
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
