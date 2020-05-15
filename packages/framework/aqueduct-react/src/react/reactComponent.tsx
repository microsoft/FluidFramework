/* eslint-disable @typescript-eslint/no-floating-promises */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";

export interface FluidProps<P, S> {
    root: ISharedDirectory;
    initialState: S,
    stateToRoot?: Map<keyof S, string>,
    handleMap?: HandleMap;
}

async function getFromRoot<T>(root: ISharedDirectory, key: string): Promise<T> {
    const value = root.get(key);
    return value.IComponentHandle ? (value as IComponentHandle<T>).get() : value as T;
}

/**
 * A react component with a root, initial props, and a root to state mapping
 */
export abstract class FluidReactComponent<P,S> extends React.Component<FluidProps<P,S>, S> {
    private readonly _root: ISharedDirectory;
    readonly stateToRoot?: Map<keyof S, string>;
    constructor(
        props: FluidProps<P,S>,
    ) {
        super(props);
        const {
            stateToRoot,
            root,
            initialState,
        } = props;

        this.state = initialState;
        this.stateToRoot = stateToRoot;
        this._root = root;
        if (stateToRoot !== undefined) {
            stateToRoot.forEach((rootKey, stateKey) => {
                root.on("valueChanged", (change, local) => {
                    if (change.key === rootKey) {
                        this.getFromRoot(rootKey).then((newData) => {
                            if (newData !== this.state[stateKey]) {
                                const newState: Partial<S> = {};
                                if (typeof initialState[stateKey] === typeof newData) {
                                    newState[stateKey] = newData as any;
                                    this.setPartialState(newState);
                                } else {
                                    throw new Error(
                                        `Root value with key ${rootKey} does not
                                         match the type for state with key ${stateKey}`);
                                }
                            }
                        });
                    }
                });
            });
        }
    }

    public async getFromRoot<T, A>(
        key: string,
        getter?:
        (root: ISharedDirectory, args?: A) => T, args?: A): Promise<T> {
        if (getter === undefined) {
            const value = this._root.get(key);
            return value.IComponentHandle ? (value as IComponentHandle<T>).get() : value as T;
        } else {
            return getter(this._root, args);
        }
    }

    public setOnRoot<T, A>(
        key: string,
        value: T,
        setter?: (root: ISharedDirectory, value: T, args?: A) => void,
        args?: A): void {
        if (setter === undefined) {
            this._root.set<T>(key, value);
        } else {
            setter(this._root, value, args);
        }
    }

    public async setPartialState(newState: Partial<S>) {
        this.setState({ ...this.state, ...newState });
    }

    public setState(newState: S) {
        super.setState(newState);
        if (this.stateToRoot !== undefined) {
            this.stateToRoot.forEach((rootKey, stateKey) => {
                this.getFromRoot(rootKey).then((rootData) => {
                    if (rootData !== newState[stateKey]) {
                        this.setOnRoot(rootKey, newState[stateKey]);
                    }
                });
            });
        }
    }
}

export interface FluidFunctionalComponentState {
    handleMap?: HandleMap;
    isInitialized?: boolean;
}

export const instanceOfIComponentLoadable = (object: any): object is IComponentLoadable =>
    object === Object(object) && "IComponentLoadable" in object;

function getByValue(map, searchValue) {
    for (const [key, value] of map.entries()) {
        if (value === searchValue)
        {return key;}
    }
}

export function useStateFluid<P,S extends FluidFunctionalComponentState>(props: FluidProps<P,S>):
[S, ((newState: S, fromRootUpdate?: boolean) => void)] {
    const [ reactState, reactSetState ] = React.useState<S>(props.initialState);
    const { root, stateToRoot } = props;
    const fluidSetState = React.useCallback((newState: Partial<S>, fromRootUpdate = false) => {
        reactSetState({ ...reactState, ...newState, isInitialized: true });
        if (stateToRoot !== undefined && !fromRootUpdate) {
            stateToRoot.forEach((rootKey, stateKey) => {
                if (newState[stateKey] !== undefined) {
                    if (instanceOfIComponentLoadable(newState[stateKey])) {
                        const stateData = (newState[stateKey] as unknown as IComponentLoadable).handle;
                        root.set(rootKey, stateData);
                    } else {
                        root.set(rootKey, newState[stateKey]);
                    }
                }
            });
        }
    }, [root, stateToRoot, reactState, reactSetState]);

    if (stateToRoot !== undefined && !reactState.isInitialized) {
        reactState.isInitialized = true;
        root.on("valueChanged", (change, local) => {
            if (Array.from(stateToRoot.values()).includes(change.key)) {
                const rootKey = change.key;
                const stateKey = getByValue(stateToRoot, rootKey);
                getFromRoot(root, rootKey).then((newData) => {
                    if (newData !== reactState[stateKey] || instanceOfIComponentLoadable(newData)) {
                        const newState: Partial<S> = {};
                        newState.isInitialized = true;
                        newState[stateKey] = newData as any;
                        fluidSetState(newState, true);
                    }
                });
            }
        });
    }

    return [reactState, fluidSetState];
}

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

export function useReducerFluid<S extends FluidFunctionalComponentState, A, B>(
    props: FluidReducerProps<S, A, B>,
): [S, (type: keyof A, ...args: any) => void, (type: keyof B, handle: IComponentHandle) => any] {
    const {
        handleMap,
        reducer,
        selector,
        root,
        runtime,
        stateToRoot,
        initialState,
    } = props;

    const [state, setState] = useStateFluid<{},S>({
        root,
        initialState,
        stateToRoot,
        handleMap,
    });

    const combinedReducer = React.useCallback((type: keyof A, ...args: any) => {
        const action =  reducer[(type)];
        const dataProps: IFluidDataProps = { runtime, handleMap: handleMap ?? new Map() };
        if (action && instanceOfStateUpdateFunction(action)) {
            const result = (action.function as any)(state, dataProps, ...args);
            setState(result);
        } else if (action && instanceOfAsyncStateUpdateFunction(action)) {
            (action.function as any)(state, dataProps, ...args).then((result) => setState(result));
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [reducer, state, setState, runtime, handleMap]);

    const combinedSelector = React.useCallback((type: keyof B, handle: IComponentHandle) => {
        const action =  selector[(type)];
        const handleMapData = handleMap ?? new Map();
        const dataProps: IFluidDataProps = { runtime, handleMap: handleMapData };
        if (action && instanceOfSelectorFunction(action)) {
            if (handleMapData.get(handle) === undefined) {
                handle.get().then((component) => {
                    handleMapData.set(handle, component);
                    setState({ ...state, handleMap: handleMapData }, true);
                });
            }
            return (action.function as any)(state, dataProps, handle);
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [reducer, state, setState, runtime, handleMap]);

    return [state, combinedReducer, combinedSelector];
}

export function createFluidContext<P,S extends FluidFunctionalComponentState>(props: FluidProps<P,S>):
[
    React.ProviderExoticComponent<React.ProviderProps<{ state: S; setState: (newState: S) => void; }>>,
    React.Consumer<{ state: S; setState: (newState: S) => void; }>,
    {state: S, setState: (newState: S) => void},
] {
    const [state, setState] = useStateFluid(props);
    const FluidContext = React.createContext({ state, setState });
    return [FluidContext.Provider, FluidContext.Consumer, { state, setState }];
}
