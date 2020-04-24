/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";

interface ReactProps<P, S> {
    root: ISharedDirectory,
    reactComponentProps: P,
    reactComponentDefaultState: S,
    rootToInitialState?: Map<string, keyof S>
    propToInitialState?: Map<keyof P, keyof S>,
    stateToRoot?: Map<keyof S, string>,
}

/**
 * A react component with a root, initial props, and a root to state mapping
 */
export abstract class FluidReactComponent<P,S> extends React.Component<ReactProps<P,S>, S> {
    readonly stateToRoot?: Map<keyof S, string>;
    readonly root: ISharedDirectory;
    constructor(
        props: ReactProps<P,S>,
    ) {
        super(props);
        const {
            root,
            propToInitialState,
            rootToInitialState,
            reactComponentDefaultState,
            reactComponentProps,
            stateToRoot,
        } = props;
        const state = reactComponentDefaultState;
        if (rootToInitialState !== undefined) {
            rootToInitialState.forEach((stateKey, rootKey) => {
                state[stateKey] = root.get(rootKey);
            });
        }
        if (propToInitialState !== undefined) {
            propToInitialState.forEach((stateKey, propKey) => {
                const value = reactComponentProps[propKey];
                if (typeof value === typeof state[stateKey]) {
                    state[stateKey] = reactComponentProps[propKey] as any;
                } else {
                    throw new Error(`Prop with key ${propKey} does not match the type for state with key ${stateKey}`);
                }
            });
        }
        if (stateToRoot !== undefined) {
            stateToRoot.forEach((rootKey, stateKey) => {
                root.on("valueChanged", (change, local) => {
                    if (change.key === rootKey) {
                        const newData = root.get(rootKey);
                        if (newData !== this.state[stateKey]) {
                            const newState: S = this.state;
                            newState[stateKey] = newData;
                            this.setState(newState);
                        }
                    }
                });
            });
        }
        this.root = root;
        this.state = state;
        this.stateToRoot = stateToRoot;
    }

    public setState(newState: S) {
        super.setState(newState);
        if (this.stateToRoot !== undefined) {
            this.stateToRoot.forEach((rootKey, stateKey) => {
                const rootData = this.root.get(rootKey);
                if (rootData !==  newState[stateKey]) {
                    this.root.set(rootKey, newState[stateKey]);
                }
            });
        }
    }
}
