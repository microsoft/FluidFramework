/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// This is disabled as we are using state updates to indicate
// when certain promises are resolved

import * as React from "react";
import {
    IFluidFunctionalComponentViewState,
    IFluidProps,
    IFluidFunctionalComponentFluidState,
} from "./interface";
import {
    initializeState,
    syncStateAndRoot,
} from "./helpers";

/**
 * A wrapper around the useState React hook that combines local and Fluid state updates
 */
export function useStateFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(props: IFluidProps<SV,SF>):
[SV, ((newState: SV, fromRootUpdate?: boolean) => void)] {
    const {
        syncedStateId,
        root,
        initialViewState,
        fluidToView,
        viewToFluid,
        dataProps,
    } = props;

    // Establish the react state and setState functions using the initialViewState passed in
    const [ reactState, reactSetState ] = React.useState<SV>(initialViewState);

    // If this is the first time this function is being called in this session
    if (!reactState.isInitialized) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        initializeState(
            syncedStateId,
            root,
            dataProps,
            reactState,
            reactSetState,
            fluidToView,
            viewToFluid,
        );
    }

    // Create the fluidSetState function as a callback that in turn calls either our combined state
    // update to both the local and Fluid state or just the local state respectively based off of
    // if the state update is coming locally, i.e. not from the root
    const fluidSetState = React.useCallback((newState: Partial<SV>, fromRootUpdate = false, isLocal = false) => {
        const newCombinedState = { ...reactState, ...newState, isInitialized: true };
        if (isLocal) {
            reactSetState(newCombinedState);
        } else {
            syncStateAndRoot(
                fromRootUpdate,
                syncedStateId,
                root,
                dataProps.runtime,
                newCombinedState,
                reactSetState,
                dataProps.fluidComponentMap,
                fluidToView,
                viewToFluid,
            );
        }
    }, [root, viewToFluid, reactState, reactSetState, dataProps]);
    return [reactState, fluidSetState];
}
