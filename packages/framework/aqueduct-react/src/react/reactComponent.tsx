/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";

export interface FluidProps<P, S> {
    root: ISharedDirectory;
    reactComponentDefaultState: S,
    reactComponentProps?: ComponentProps<P, S>,
    rootToInitialState?: Map<string, keyof S>
    stateToRoot?: Map<keyof S, string>,
}

interface ComponentProps<P, S> {
    props: P;
    propToInitialState?: Map<keyof P, keyof S>,
}

function initializeState<P,S>(props: FluidProps<P,S>) {
    const {
        root,
        rootToInitialState,
        reactComponentDefaultState,
        reactComponentProps,
    } = props;
    const combinedState = reactComponentDefaultState;
    if (rootToInitialState !== undefined) {
        rootToInitialState.forEach((stateKey, rootKey) => {
            combinedState[stateKey] = root.get(rootKey);
        });
    }
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
        } = props;

        this.state = initializeState(props);
        this.stateToRoot = stateToRoot;
        this._root = root;
        if (stateToRoot !== undefined) {
            stateToRoot.forEach((rootKey, stateKey) => {
                root.on("valueChanged", (change, local) => {
                    if (change.key === rootKey) {
                        const newData = this.getFromRoot(rootKey);
                        if (newData !== this.state[stateKey]) {
                            const newState: S = this.state;
                            if (typeof newState[stateKey] === typeof newData) {
                                newState[stateKey] = newData as any;
                                this.setState(newState);
                            } else {
                                throw new Error(
                                    `Root value with key ${rootKey} does not
                                     match the type for state with key ${stateKey}`);
                            }
                        }
                    }
                });
            });
        }
    }

    public getFromRoot<T, A>(key: string, getter?: (root: ISharedDirectory, args?: A) => T, args?: A): T {
        return getter === undefined ? this._root.get<T>(key) : getter(this._root, args);
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

    public setState(newState: S) {
        super.setState(newState);
        if (this.stateToRoot !== undefined) {
            this.stateToRoot.forEach((rootKey, stateKey) => {
                const rootData = this.getFromRoot(rootKey);
                if (rootData !==  newState[stateKey]) {
                    this.setOnRoot(rootKey, newState[stateKey]);
                }
            });
        }
    }
}

export interface FluidFunctionalComponentState {
    isInitialized?: boolean;
}

export function useStateFluid<P,S extends FluidFunctionalComponentState>(props: FluidProps<P,S>):
[S, ((newState: S) => void)] {
    const [ reactState, reactSetState ] = React.useState<S>(props.reactComponentDefaultState);
    const { root, stateToRoot } = props;
    const fluidSetState = React.useCallback((newState: S) => {
        reactSetState({ ...newState, isInitialized: true });
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
                        const newData = root.get(rootKey);
                        if (newData !== reactState[stateKey]) {
                            const newState: S = reactState;
                            newState[stateKey] = newData;
                            fluidSetState(newState);
                        }
                    }
                });
            });
        }
    }

    return [nextState, fluidSetState];
}
