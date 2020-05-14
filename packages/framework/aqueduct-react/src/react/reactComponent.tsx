/* eslint-disable @typescript-eslint/no-floating-promises */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";

export interface FluidProps<P, S> {
    root: ISharedDirectory;
    initialState: S,
    reactComponentProps?: ComponentProps<P, S>,
    stateToRoot?: Map<keyof S, string>,
}

interface ComponentProps<P, S> {
    props: P;
    propToInitialState?: Map<keyof P, keyof S>,
}

async function getFromRoot<T>(root: ISharedDirectory, key: string): Promise<T> {
    const value = root.get(key);
    return value.IComponentHandle ? (value as IComponentHandle<T>).get() : value as T;
}

function initializeState<P,S>(props: FluidProps<P,S>) {
    const {
        initialState,
        reactComponentProps,
    } = props;
    const combinedState = initialState;
    if (reactComponentProps !== undefined && reactComponentProps.propToInitialState !== undefined) {
        reactComponentProps.propToInitialState.forEach((stateKey, propKey) => {
            const value = reactComponentProps.props[propKey];
            if (typeof value === typeof combinedState[stateKey]) {
                combinedState[stateKey] = value as any;
            } else {
                throw new Error(
                    `Prop with key ${propKey} does not match the type for state with key ${stateKey}`);
            }
        });
    }
    return combinedState;
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

        this.state = initializeState(props);
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
    isInitialized?: boolean
}

export function useStateFluid<P,S extends FluidFunctionalComponentState>(props: FluidProps<P,S>):
[S, ((newState: S) => void)] {
    const [ reactState, reactSetState ] = React.useState<S>(props.initialState);
    const { root, stateToRoot } = props;
    const fluidSetState = React.useCallback((newState: Partial<S>) => {
        reactSetState({ ...reactState, ...newState, isInitialized: true });
        if (stateToRoot !== undefined) {
            stateToRoot.forEach((rootKey, stateKey) => {
                const rootData = root.get(rootKey);
                if (rootData !==  newState[stateKey]) {
                    root.set(rootKey, newState[stateKey]);
                }
            });
        }
    }, [root, stateToRoot, reactState, reactSetState]);

    let nextState: S = reactState;
    if (!reactState.isInitialized) {
        nextState = { ...initializeState(props), isInitialized: true };
        if (stateToRoot !== undefined) {
            stateToRoot.forEach((rootKey, stateKey) => {
                root.on("valueChanged", (change, local) => {
                    if (change.key === rootKey) {
                        getFromRoot(root, rootKey).then((newData) => {
                            if (newData !== reactState[stateKey]) {
                                const newState: Partial<S> = {};
                                newState[stateKey] = newData as any;
                                newState.isInitialized = true;
                                fluidSetState(newState);
                            }
                        });
                    }
                });
            });
        }
    }

    return [nextState, fluidSetState];
}

export interface FluidReducerProps<S extends FluidFunctionalComponentState, A> {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    initialState: S,
    reducer: A,
    stateToRoot?: Map<keyof S, string>,
    selector?: keyof S
}

export interface FluidStateUpdateFunction<S> {
    function: (oldState: S, runtime: IComponentRuntime, ...args: any) => S;
}

export const instanceOfStateUpdateFunction = <S,>(object: any): object is FluidStateUpdateFunction<S> =>
    "function" in object;

export interface FluidAsyncStateUpdateFunction<S> {
    function: (oldState: S, runtime: IComponentRuntime, ...args: any) => Promise<S>;
}

export const instanceOfAsyncStateUpdateFunction = <S,>(object: any): object is FluidAsyncStateUpdateFunction<S> =>
    "function" in object;

export function useReducerFluid<S extends FluidFunctionalComponentState, A>(
    props: FluidReducerProps<S, A>,
): [S, (type: keyof A, ...args: any) => void] {
    const {
        reducer,
        root,
        runtime,
        stateToRoot,
        initialState,
    } = props;

    const [state, setState] = useStateFluid<{},S>({
        root,
        initialState,
        stateToRoot,
    });

    const combinedReducer = React.useCallback((type: keyof A, ...args: any) => {
        const action =  reducer[(type)];
        if (action && instanceOfStateUpdateFunction(action)) {
            const result = (action.function as any)(state, runtime, ...args);
            setState(result);
        } else if (action && instanceOfAsyncStateUpdateFunction(action)) {
            (action.function as any)(state, runtime, ...args).then((result) => setState(result));
        } else {
            throw new Error(
                `Action with key ${action} does not
                 exist in the reducers provided`);
        }
    }, [reducer, state, setState]);

    return [state, combinedReducer];
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
