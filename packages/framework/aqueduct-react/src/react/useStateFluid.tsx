/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IComponentLoadable, IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    FluidFunctionalComponentState,
    FluidProps,
    instanceOfIComponentLoadable,
    IFluidComponent,
} from "./interface";
import {  updateStateAndComponentMap } from "./updateStateAndComponentMap";

export function useStateFluid<P,S extends FluidFunctionalComponentState>(props: FluidProps<P,S>):
[S, ((newState: S, fromRootUpdate?: boolean) => void)] {
    const [ reactState, reactSetState ] = React.useState<S>(props.initialState);
    const { root, stateToRoot, fluidComponentMap } = props;
    const fluidSetState = React.useCallback((newState: Partial<S>, fromRootUpdate = false) => {
        const newCombinedState = { ...reactState, ...newState, isInitialized: true };
        reactSetState(newCombinedState);
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
        const unlistenedComponentHandles: IComponentHandle[] = [];
        fluidComponentMap.forEach((value: IFluidComponent, key: IComponentHandle) => {
            if (!value.isListened && value.component.handle !== undefined) {
                unlistenedComponentHandles.push(value.component.handle);
            }
        });
        // This can be disabled as the state update will be triggered after the promises resolve
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        updateStateAndComponentMap(
            unlistenedComponentHandles,
            fluidComponentMap,
            root,
            reactState,
            reactSetState,
            stateToRoot,
        );
    }

    return [reactState, fluidSetState];
}
