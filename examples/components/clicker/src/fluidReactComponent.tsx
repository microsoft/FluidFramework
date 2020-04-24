/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";

interface ReactProps {
    root: ISharedDirectory,
    reactComponentProps: any, // should be P
    rootToInitialState?: any, // should be Map<string, keyof S>
    stateToRoot?: any, // should be Map<keyof S, string>,
}

/**
 * A component to allow you to share your location with others
 */
export abstract class FluidReactComponent<P,S> extends React.Component<ReactProps, S> {
    readonly stateToRoot?: Map<keyof S, string>;
    readonly root: ISharedDirectory;
    constructor(
        props: ReactProps,
    ) {
        super(props);
        const { root, rootToInitialState, stateToRoot } = props;
        const state: Partial<S> = {};
        if (rootToInitialState) {
            rootToInitialState.forEach((stateKey, rootKey) => {
                state[stateKey] = root.get(rootKey);
            });
        }
        if (stateToRoot) {
            stateToRoot.forEach((rootKey, stateKey) => {
                root.on("valueChanged", (change, local) => {
                    const newData = root.get(rootKey);
                    if (newData !== this.state[stateKey]) {
                        const newState: S = this.state;
                        newState[stateKey] = newData;
                        this.setState(newState);
                    }
                });
            });
        }
        this.root = root;
        this.state = state as S;
        this.stateToRoot = stateToRoot;
    }

    public setState(newState: S) {
        super.setState(newState);
        if (this.stateToRoot) {
            this.stateToRoot.forEach((rootKey, stateKey) => {
                const rootData = this.root.get(rootKey);
                if (rootData !==  newState[stateKey]) {
                    this.root.set(rootKey, newState[stateKey]);
                }
            });
        }
    }
}
