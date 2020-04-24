/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";

/**
 * A component to allow you to share your location with others
 */
export abstract class FluidReactComponent<P,S> extends React.Component<P, S> {
    constructor(
        public root: ISharedDirectory,
        reactComponentProps: P,
        rootToInitialState: Map<string, keyof S>,
        stateToRoot: Map<keyof S, string>,
    ) {
        super(reactComponentProps);
        const state: Partial<S> = {};
        rootToInitialState.forEach((stateKey, rootKey) => {
            state[stateKey] = root.get(rootKey);
        });
        this.state = state as S;
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
}
