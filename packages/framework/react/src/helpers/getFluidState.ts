/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandle,
} from "@fluidframework/component-core-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    IViewConverter,
    FluidComponentMap,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISyncedState,
} from "..";

/**
 * Return the Fluid state from the syncedState with all handles converted into components
 * @param syncedStateId - Unique ID for the synced state of this component
 * @param syncedState - Shared directory the component's synced state is stored on
 * @param componentMap - Map of component handle paths to their respective components
 * @param fluidToView - Map of the Fluid state keys contains the optional syncedState key parameter,
 * in case the fluid value is stored in the syncedState under a different key
 */
export function getFluidState<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    syncedStateId: string,
    syncedState: ISyncedState,
    componentMap: FluidComponentMap,
    fluidToView?: Map<keyof SF, IViewConverter<SV, SF>>,
): SF | undefined {
    const componentStateHandle = syncedState.get<IComponentHandle<ISharedMap>>(
        `syncedState-${syncedStateId}`,
    );
    if (componentStateHandle === undefined) {
        return;
    }
    const componentState = componentMap.get(componentStateHandle.path)
        ?.component as SharedMap;
    if (componentState === undefined) {
        return;
    }
    const fluidState = {};
    for (const fluidKey of componentState.keys()) {
        const createCallback = fluidToView?.get(fluidKey as keyof SF)
            ?.sharedObjectCreate;
        let value = componentState.get(fluidKey);
        if (value && createCallback) {
            const possibleComponentPath = (value as IComponent)
                ?.IComponentHandle?.path;
            if (possibleComponentPath !== undefined) {
                value = componentMap.get(possibleComponentPath);
                fluidState[fluidKey] = value?.component;
            } else {
                fluidState[fluidKey] = value;
            }
        } else {
            fluidState[fluidKey] = value;
        }
    }
    return fluidState as SF;
}
