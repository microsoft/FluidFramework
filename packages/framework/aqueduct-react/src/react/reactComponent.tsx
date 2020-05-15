/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-floating-promises */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { FluidProps } from "./interface";

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
