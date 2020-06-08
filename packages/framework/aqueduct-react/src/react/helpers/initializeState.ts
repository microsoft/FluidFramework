/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IDirectoryValueChanged, ISharedDirectory, SharedMap } from "@fluidframework/map";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import {
    IFluidDataProps,
    FluidToViewMap,
    ViewToFluidMap,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
} from "../interface";
import {
    getFluidStateFromRoot,
    getComponentSchemaFromRoot,
    generateComponentSchema,
    setComponentSchemaToRoot,
    rootCallbackListener,
    updateStateAndComponentMap,
} from ".";
import { IFluidSchema, IFluidComponent } from "..";

/**
 * Initialize the stored state on the root and dynamically generate the schemas
 * that will be used for all future operations
 * @param syncedStateId - Unique ID for this synced component's state
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param dataProps - Contains the runtime and fluidComponentMap to create and store DDS'
 * @param state - Current view state
 * @param setState - Callback to update view state
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export async function initializeState<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    syncedStateId,
    root: ISharedDirectory,
    dataProps: IFluidDataProps,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean, isLocal?: boolean) => void,
    fluidToView: FluidToViewMap<SV,SF>,
    viewToFluid?: ViewToFluidMap<SV,SF>,
): Promise<void> {
    let unlistenedComponentHandles: IComponentHandle[] = [];
    let storedFluidStateHandle = root.get<IComponentHandle>(`syncedState-${syncedStateId}`);
    if (storedFluidStateHandle === undefined) {
        const storedFluidState = SharedMap.create(dataProps.runtime);
        dataProps.fluidComponentMap.set(storedFluidState.handle.path, {
            component: storedFluidState,
            isRuntimeMap: true,
        });
        root.set(`syncedState-${syncedStateId}`, storedFluidState.handle);
        storedFluidStateHandle = storedFluidState.handle;
    } else {
        dataProps.fluidComponentMap.set(storedFluidStateHandle.path, {
            component: await storedFluidStateHandle.get(),
            isRuntimeMap: true,
        });
    }
    const fluidStateMap = await storedFluidStateHandle.get() as SharedMap;
    if (fluidStateMap === undefined) {
        throw Error("Failed to initialize synced fluid state");
    }

    for (const key of fluidToView.keys()) {
        const fluidKey = key as string;
        const rootKey = fluidToView?.get(fluidKey as keyof SF)?.rootKey;
        const createCallback = fluidToView?.get(fluidKey as keyof SF)?.sharedObjectCreate;
        if (createCallback) {
            if (fluidStateMap.get(fluidKey) === undefined) {
                const sharedObject = createCallback(dataProps.runtime);
                dataProps.fluidComponentMap.set(sharedObject.handle.path, {
                    component: sharedObject,
                    listenedEvents: fluidToView?.get(fluidKey as keyof SF)?.listenedEvents || ["valueChanged"],
                });
                fluidStateMap.set(fluidKey, sharedObject.handle);
                if (rootKey) {
                    root.set(rootKey, sharedObject.handle);
                }
            } else {
                const handle = fluidStateMap.get(fluidKey);
                dataProps.fluidComponentMap.set(handle.path, {
                    component: await handle.get(),
                    listenedEvents: fluidToView?.get(fluidKey as keyof SF)?.listenedEvents,
                });
            }
        } else if (rootKey) {
            fluidStateMap.set(fluidKey, root.get(rootKey));
        }
    }

    unlistenedComponentHandles.push(storedFluidStateHandle);
    const initFluidState = getFluidStateFromRoot(
        syncedStateId,
        root,
        dataProps.fluidComponentMap,
        fluidToView,
    );
    if (!initFluidState) {
        throw Error("Failed to initialize fluid state");
    }

    // If the stored schema is undefined on this root, i.e. it is the first time this
    // component is being loaded, generate it and store it
    let componentSchemaHandles = getComponentSchemaFromRoot(syncedStateId, root);
    if (componentSchemaHandles === undefined) {
        const componentSchema: IFluidSchema = generateComponentSchema(
            dataProps.runtime,
            state,
            initFluidState,
            fluidToView,
            viewToFluid,
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

    state.isInitialized = true;
    state.syncedStateId = syncedStateId;

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
            component: await handle.get(),
        });
    }

    // Define the root callback listener that will be responsible for triggering state updates on root value changes
    const initRootCallback = (change: IDirectoryValueChanged, local: boolean) => {
        const callback = rootCallbackListener(
            dataProps.fluidComponentMap,
            syncedStateId,
            root,
            dataProps.runtime,
            state,
            setState,
            fluidToView,
            viewToFluid,
        );
        return callback(change, local);
    };
    // Add the callback to the component's own root
    root.on("valueChanged", initRootCallback);
    // Add the callback to all the unlistened components and then update the state afterwards
    return updateStateAndComponentMap<SV,SF>(
        unlistenedComponentHandles,
        dataProps.fluidComponentMap,
        true,
        syncedStateId,
        root,
        dataProps.runtime,
        state,
        setState,
        initRootCallback,
        fluidToView,
        viewToFluid,
    );
}
