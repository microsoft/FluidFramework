/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// This is disabled as we are using state updates to indicate
// when certain promises are resolved
/* eslint-disable @typescript-eslint/no-floating-promises */

import * as React from "react";
import { IDirectoryValueChanged } from "@microsoft/fluid-map-component-definitions";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidFunctionalComponentViewState,
    FluidProps,
    IFluidComponent,
    IFluidFunctionalComponentFluidState,
} from "./interface";
import {
    updateStateAndComponentMap,
    syncStateAndRoot,
    rootCallbackListener,
} from "./updateStateAndComponentMap";

export function useStateFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(props: FluidProps<SV,SF>):
[SV, ((newState: SV, fromRootUpdate?: boolean) => void)] {
    const {
        root,
        initialFluidState,
        initialViewState,
        fluidToView,
        viewToFluid,
        fluidComponentMap,
    } = props;
    const [ reactState, reactSetState ] = React.useState<SV>(initialViewState);

    const fluidSetState = React.useCallback((newState: Partial<SV>, fromRootUpdate = false) => {
        const newCombinedState = { ...reactState, ...newState, isInitialized: true };
        if (!fromRootUpdate) {
            syncStateAndRoot(
                fromRootUpdate,
                root,
                reactState,
                reactSetState,
                fluidComponentMap,
                viewToFluid,
                fluidToView,
            );
        } else {
            reactSetState(newCombinedState);
        }
    }, [root, viewToFluid, reactState, reactSetState, fluidComponentMap]);

    const rootCallback = React.useCallback(
        (change: IDirectoryValueChanged, local: boolean) => {
            const callback = rootCallbackListener(
                fluidComponentMap,
                true,
                root,
                reactState,
                reactSetState,
                viewToFluid,
                fluidToView,
            );
            return callback(change, local);
        }, [root, fluidToView, viewToFluid, reactState, reactSetState, fluidComponentMap]);

    if (viewToFluid !== undefined && !reactState.isInitialized) {
        if (root.get("syncedState") === undefined) {
            root.set("syncedState", initialFluidState);
        }
        root.on("valueChanged", rootCallback);
        reactState.isInitialized = true;
        const unlistenedComponentHandles: IComponentHandle[] = [];
        fluidComponentMap.forEach((value: IFluidComponent, key: IComponentHandle) => {
            if (!value.isListened && value.component.handle !== undefined) {
                unlistenedComponentHandles.push(value.component.handle);
            }
        });
        updateStateAndComponentMap(
            unlistenedComponentHandles,
            fluidComponentMap,
            false,
            root,
            reactState,
            reactSetState,
            rootCallback,
            viewToFluid,
            fluidToView,
        );
    }

    return [reactState, fluidSetState];
}
