/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";
import { initializeState, syncState } from "./helpers";
/**
 * A wrapper around the useState React hook that combines local and Fluid state updates
 */
export function useStateFluid(props, initialViewState) {
    var _a;
    const { syncedStateId, syncedDataObject, } = props;
    const config = syncedDataObject.getConfig(syncedStateId);
    if (config === undefined) {
        throw Error(`Failed to find configuration for synced state ID: ${syncedStateId}`);
    }
    const syncedState = syncedDataObject.syncedState;
    const dataProps = (_a = props.dataProps) !== null && _a !== void 0 ? _a : syncedDataObject.dataProps;
    const { fluidToView, viewToFluid } = config;
    // Establish the react state and setState functions using the initialViewState passed in
    const [reactState, reactSetState] = React.useState(initialViewState);
    // If this is the first time this function is being called in this session
    // It's okay to disable eslint here as the state will be updated with the initialized values
    // after the async call has finished
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!reactState.isInitialized) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        initializeState(syncedStateId, syncedState, dataProps, reactState, reactSetState, fluidToView, viewToFluid);
    }
    // Create the fluidSetState function as a callback that in turn calls either our combined state
    // update to both the local and Fluid state or just the local state respectively based off of
    // if the state update is coming locally, i.e. not from the root
    const fluidSetState = React.useCallback((newState, fromRootUpdate = false, isLocal = false) => {
        const newCombinedState = Object.assign(Object.assign(Object.assign({}, reactState), newState), { isInitialized: true });
        if (isLocal) {
            reactSetState(newCombinedState);
        }
        else {
            syncState(fromRootUpdate, syncedStateId, syncedState, dataProps.runtime, newCombinedState, reactSetState, dataProps.fluidObjectMap, fluidToView, viewToFluid);
        }
    }, [syncedState, viewToFluid, reactState, reactSetState, dataProps]);
    return [reactState, fluidSetState];
}
//# sourceMappingURL=useStateFluid.js.map