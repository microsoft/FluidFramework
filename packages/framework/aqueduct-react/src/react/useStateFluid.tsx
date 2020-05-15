/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-floating-promises */

import * as React from "react";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { FluidFunctionalComponentState, FluidProps, instanceOfIComponentLoadable } from "./interface";

async function getFromRoot<T>(root: ISharedDirectory, key: string): Promise<T> {
    const value = root.get(key);
    return value.IComponentHandle ? (value as IComponentHandle<T>).get() : value as T;
}

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
