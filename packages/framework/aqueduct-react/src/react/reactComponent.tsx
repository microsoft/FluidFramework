/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";

export interface FluidProps<P, S, Q, M> {
    root: ISharedDirectory;
    reactComponentDefaultState: S,
    reactComponentProps?: ComponentProps<P, S>,
    rootToInitialState?: Map<string, keyof S>
    stateToRoot?: Map<keyof S, string>,
    rootQueries?: Q;
    rootMutations?: M;
}

interface ComponentProps<P, S> {
    props: P;
    propToInitialState?: Map<keyof P, keyof S>,
}

function initializeState<P,S,Q,M>(props: FluidProps<P,S,Q,M>) {
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
export abstract class FluidReactComponent<P,S,Q,M> extends React.Component<FluidProps<P,S,Q,M>, S> {
    private readonly _root: ISharedDirectory;
    readonly stateToRoot?: Map<keyof S, string>;
    readonly rootQueries?: Q;
    readonly rootMutations?: M;
    constructor(
        props: FluidProps<P,S,Q,M>,
    ) {
        super(props);
        const {
            stateToRoot,
            root,
            rootQueries,
            rootMutations,
        } = props;

        this.state = initializeState(props);
        this.stateToRoot = stateToRoot;
        this.rootQueries = rootQueries;
        this.rootMutations = rootMutations;
        this._root = root;
        if (stateToRoot !== undefined) {
            stateToRoot.forEach((rootKey, stateKey) => {
                root.on("valueChanged", (change, local) => {
                    if (change.key === rootKey) {
                        const newData = this.getFromRoot(rootKey);
                        if (newData !== this.state[stateKey]) {
                            const newState: S = this.state;
                            newState[stateKey] = newData;
                            this.setState(newState);
                        }
                    }
                });
            });
        }
    }

    public getFromRoot = (key: string) => this._root.get(key);
    public setOnRoot = (key: string, value: any) => this._root.set(key, value);

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
    isInitialized: boolean;
}

export function useStateFluid<P,S extends FluidFunctionalComponentState,Q,M>(props: FluidProps<P,S,Q,M>):
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
