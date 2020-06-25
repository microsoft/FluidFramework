/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    IFluidFunctionalComponentViewState,
    IFluidProps,
    IFluidFunctionalComponentFluidState,
    ISyncedStateConfig,
} from "./interface";
import { initializeState, syncState } from "./helpers";

/**
 * A wrapper around the useState React hook that combines local and Fluid state updates
 */
export function useStateFluid<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    props: IFluidProps<SV, SF>, initialViewState: SV,
): [SV, (newState: SV, isSyncedStateUpdate?: boolean) => void] {
    const {
        syncedStateId,
        syncedComponent,
    } = props;
    const config = syncedComponent.syncedStateConfig.get(syncedStateId);
    if (config === undefined) {
        throw Error(`Failed to find configuration for synced state ID: ${syncedStateId}`);
    }
    const syncedState = syncedComponent.syncedState;
    const dataProps = props.dataProps || syncedComponent.dataProps;
    const { fluidToView, viewToFluid } = config as ISyncedStateConfig<SV, SF>;
    // Establish the react state and setState functions using the initialViewState passed in
    const [reactState, reactSetState] = React.useState<SV>(initialViewState);

    // If this is the first time this function is being called in this session
    // It's okay to disable eslint here as the state will be updated with the initialized values
    // after the async call has finished
    if (!reactState.isInitialized) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        initializeState<SV, SF>(
            syncedStateId,
            syncedState,
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
    const fluidSetState = React.useCallback(
        (newState: Partial<SV>, fromRootUpdate = false, isLocal = false) => {
            const newCombinedState = {
                ...reactState,
                ...newState,
                isInitialized: true,
            };
            if (isLocal) {
                reactSetState(newCombinedState);
            } else {
                syncState(
                    fromRootUpdate,
                    syncedStateId,
                    syncedState,
                    dataProps.runtime,
                    newCombinedState,
                    reactSetState,
                    dataProps.fluidComponentMap,
                    fluidToView,
                    viewToFluid,
                );
            }
        },
        [syncedState, viewToFluid, reactState, reactSetState, dataProps],
    );
    return [reactState, fluidSetState];
}
