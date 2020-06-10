/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedMap, } from "@fluidframework/map";
import { getFluidStateFromRoot, getComponentSchemaFromRoot, generateComponentSchema, setComponentSchemaToRoot, rootCallbackListener, updateStateAndComponentMap, } from ".";
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
export async function initializeState(syncedStateId, root, dataProps, state, setState, fluidToView, viewToFluid) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    let unlistenedComponentHandles = [];
    let storedFluidStateHandle = root.get(`syncedState-${syncedStateId}`);
    // TODO #2457 - Move synced state initializing into component lifecycle, expose API for update
    if (storedFluidStateHandle === undefined) {
        const storedFluidState = SharedMap.create(dataProps.runtime);
        dataProps.fluidComponentMap.set(storedFluidState.handle.path, {
            component: storedFluidState,
            isRuntimeMap: true,
        });
        root.set(`syncedState-${syncedStateId}`, storedFluidState.handle);
        storedFluidStateHandle = storedFluidState.handle;
    }
    else {
        dataProps.fluidComponentMap.set(storedFluidStateHandle.path, {
            component: await storedFluidStateHandle.get(),
            isRuntimeMap: true,
        });
    }
    const fluidStateMap = (await storedFluidStateHandle.get());
    if (fluidStateMap === undefined) {
        throw Error("Failed to initialize synced fluid state");
    }
    for (const key of fluidToView.keys()) {
        const fluidKey = key;
        const rootKey = (_b = (_a = fluidToView) === null || _a === void 0 ? void 0 : _a.get(fluidKey)) === null || _b === void 0 ? void 0 : _b.rootKey;
        const createCallback = (_d = (_c = fluidToView) === null || _c === void 0 ? void 0 : _c.get(fluidKey)) === null || _d === void 0 ? void 0 : _d.sharedObjectCreate;
        if (createCallback) {
            if (fluidStateMap.get(fluidKey) === undefined) {
                const sharedObject = createCallback(dataProps.runtime);
                dataProps.fluidComponentMap.set(sharedObject.handle.path, {
                    component: sharedObject,
                    listenedEvents: ((_f = (_e = fluidToView) === null || _e === void 0 ? void 0 : _e.get(fluidKey)) === null || _f === void 0 ? void 0 : _f.listenedEvents) || ["valueChanged"],
                });
                fluidStateMap.set(fluidKey, sharedObject.handle);
                if (rootKey) {
                    root.set(rootKey, sharedObject.handle);
                }
            }
            else {
                const handle = fluidStateMap.get(fluidKey);
                dataProps.fluidComponentMap.set(handle.path, {
                    component: await handle.get(),
                    listenedEvents: (_h = (_g = fluidToView) === null || _g === void 0 ? void 0 : _g.get(fluidKey)) === null || _h === void 0 ? void 0 : _h.listenedEvents,
                });
            }
        }
        else if (rootKey) {
            fluidStateMap.set(fluidKey, root.get(rootKey));
        }
    }
    unlistenedComponentHandles.push(storedFluidStateHandle);
    const initFluidState = getFluidStateFromRoot(syncedStateId, root, dataProps.fluidComponentMap, fluidToView);
    if (!initFluidState) {
        throw Error("Failed to initialize fluid state");
    }
    // If the stored schema is undefined on this root, i.e. it is the first time this
    // component is being loaded, generate it and store it
    let componentSchemaHandles = getComponentSchemaFromRoot(syncedStateId, root);
    if (componentSchemaHandles === undefined) {
        const componentSchema = generateComponentSchema(dataProps.runtime, state, initFluidState, fluidToView, viewToFluid);
        componentSchemaHandles = {
            componentKeyMapHandle: componentSchema.componentKeyMap
                .handle,
            fluidMatchingMapHandle: componentSchema.fluidMatchingMap
                .handle,
            viewMatchingMapHandle: componentSchema.viewMatchingMap
                .handle,
        };
        setComponentSchemaToRoot(syncedStateId, root, componentSchemaHandles);
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
    const unlistenedMapHandles = [...unlistenedComponentHandles];
    dataProps.fluidComponentMap.forEach((value, k) => {
        var _a;
        if (!value.isListened && ((_a = value.component) === null || _a === void 0 ? void 0 : _a.handle) !== undefined) {
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
    const initRootCallback = (change, local) => {
        const callback = rootCallbackListener(dataProps.fluidComponentMap, syncedStateId, root, dataProps.runtime, state, setState, fluidToView, viewToFluid);
        return callback(change, local);
    };
    // Add the callback to the component's own root
    root.on("valueChanged", initRootCallback);
    // Add the callback to all the unlistened components and then update the state afterwards
    return updateStateAndComponentMap(unlistenedComponentHandles, dataProps.fluidComponentMap, true, syncedStateId, root, dataProps.runtime, state, setState, initRootCallback, fluidToView, viewToFluid);
}
//# sourceMappingURL=initializeState.js.map