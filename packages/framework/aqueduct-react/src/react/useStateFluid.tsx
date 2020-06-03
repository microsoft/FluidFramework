/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// This is disabled as we are using state updates to indicate
// when certain promises are resolved
/* eslint-disable @typescript-eslint/no-floating-promises */

import * as React from "react";
import { IDirectoryValueChanged, ISharedMap } from "@fluidframework/map";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import {
    IFluidFunctionalComponentViewState,
    IFluidProps,
    IFluidComponent,
    IFluidFunctionalComponentFluidState,
    IFluidSchema,
} from "./interface";
import {
    updateStateAndComponentMap,
    syncStateAndRoot,
    rootCallbackListener,
    generateComponentSchema,
    setFluidStateToRoot,
    setComponentSchemaToRoot,
    getComponentSchemaFromRoot,
    getFluidStateFromRoot,
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
        initialFluidState,
        initialViewState,
        fluidToView,
        viewToFluid,
        dataProps,
    } = props;
    // Establish the react state and setState functions using the initialViewState passed in
    const [ reactState, reactSetState ] = React.useState<SV>(initialViewState);

    // Create the fluidSetState function as a callback that in turn calls either our combined state
    // update to both the local and Fluid state or just the local state respectively based off of
    // if the state update is coming locally, i.e. not from the root
    const fluidSetState = React.useCallback((newState: Partial<SV>, fromRootUpdate = false, isLocal = false) => {
        const newCombinedState = { ...reactState, ...newState, isInitialized: true };
        if (isLocal) {
            reactSetState(newCombinedState);
        } else {
            const fluidState = getFluidStateFromRoot(
                syncedStateId,
                root,
                dataProps.fluidComponentMap,
                initialFluidState,
                fluidToView,
            );
            syncStateAndRoot(
                fromRootUpdate,
                syncedStateId,
                root,
                dataProps.runtime,
                newCombinedState,
                reactSetState,
                dataProps.fluidComponentMap,
                fluidState,
                viewToFluid,
                fluidToView,
            );
        }
    }, [root, viewToFluid, reactState, reactSetState, dataProps]);

    // Define the root callback listener that will be responsible for triggering state updates on root value changes
    const rootCallback = React.useCallback(
        (change: IDirectoryValueChanged, local: boolean) => {
            const callback = rootCallbackListener(
                dataProps.fluidComponentMap,
                syncedStateId,
                root,
                dataProps.runtime,
                reactState,
                reactSetState,
                initialFluidState,
                viewToFluid,
                fluidToView,
            );
            return callback(change, local);
        }, [root, fluidToView, viewToFluid, reactState, reactSetState, dataProps]);

    // If this is the first time this function is being called in this session
    if (!reactState.isInitialized) {
        let unlistenedComponentHandles: IComponentHandle[] = [];
        // Check if there is a synced state value already stored, i.e. if the component has been loaded before
        let loadFromRoot = true;
        const storedFluidStateHandle = root.get(`syncedState-${syncedStateId}`);
        if (storedFluidStateHandle === undefined) {
            loadFromRoot = false;
            const stateMapHandle = setFluidStateToRoot(
                syncedStateId,
                root,
                dataProps.runtime,
                dataProps.fluidComponentMap,
                initialFluidState,
            );
            unlistenedComponentHandles.push(stateMapHandle);
        } else {
            unlistenedComponentHandles.push(storedFluidStateHandle);
        }

        // If the stored schema is undefined on this root, i.e. it is the first time this
        // component is being loaded, generate it and store it
        let componentSchemaHandles = getComponentSchemaFromRoot(syncedStateId, root);
        if (componentSchemaHandles === undefined) {
            const componentSchema: IFluidSchema = generateComponentSchema(
                dataProps.runtime,
                reactState,
                initialFluidState,
                viewToFluid,
                fluidToView,
            );
            componentSchemaHandles = {
                componentKeyMapHandle: componentSchema.componentKeyMap.handle as IComponentHandle<ISharedMap>,
                fluidMatchingMapHandle: componentSchema.fluidMatchingMap.handle as IComponentHandle<ISharedMap>,
                viewMatchingMapHandle: componentSchema.viewMatchingMap.handle as IComponentHandle<ISharedMap>,
            };
            setComponentSchemaToRoot(syncedStateId, root, componentSchemaHandles);
        }
        // We should have component schemas now, either freshly generated or from the root
        if (
            componentSchemaHandles.componentKeyMapHandle === undefined
            || componentSchemaHandles.viewMatchingMapHandle === undefined
            || componentSchemaHandles.fluidMatchingMapHandle === undefined) {
            throw Error("Failed to generate schema handles for the component");
        }

        // Add the callback to the component's own root
        root.on("valueChanged", rootCallback);
        reactState.isInitialized = true;
        reactState.syncedStateId = syncedStateId;

        // Add the list of SharedMap handles for the schema and any unlistened handles passed in through the component
        // map to the list of handles we will fetch and start listening to
        unlistenedComponentHandles = [
            ...unlistenedComponentHandles,
            ...[
                componentSchemaHandles.componentKeyMapHandle,
                componentSchemaHandles.fluidMatchingMapHandle,
                componentSchemaHandles.viewMatchingMapHandle,
            ],
        ];
        const unlistenedMapHandles = [ ...unlistenedComponentHandles ];
        dataProps.fluidComponentMap.forEach((value: IFluidComponent, k) => {
            if (!value.isListened && value.component?.handle !== undefined) {
                unlistenedComponentHandles.push(value.component.handle);
            }
        });

        // Initialize the FluidComponentMap with our data handles
        for (const handle of unlistenedMapHandles) {
            dataProps.fluidComponentMap.set(handle.path, {
                isListened: false,
                isRuntimeMap: true,
            });
        }

        // Add the callback to all the unlistened components and then update the state afterwards
        updateStateAndComponentMap<SV,SF>(
            unlistenedComponentHandles,
            dataProps.fluidComponentMap,
            loadFromRoot,
            syncedStateId,
            root,
            dataProps.runtime,
            reactState,
            reactSetState,
            initialFluidState,
            rootCallback,
            viewToFluid,
            fluidToView,
        );
    }

    return [reactState, fluidSetState];
}
