/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHandle } from "@fluidframework/component-core-interfaces";
import { ISharedDirectory, ISharedMap, SharedMap } from "@fluidframework/map";
import { IViewConverter, FluidComponentMap } from "..";

/**
 * Return the Fluid state from the root with all handles converted into components
 * @param syncedStateId - Unique ID for the synced state of this component
 * @param root - Shared directory the component's synced state is stored on
 * @param componentMap - Map of component handle paths to their respective components
 * @param fluidToView - Map of the Fluid state keys contains the optional root key parameter,
 * in case the fluid value is stored in the root under a different key
 */
export function getFluidStateFromRoot<SV,SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    componentMap: FluidComponentMap,
    fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>,
): SF | undefined {
    const rootStateHandle = root.get<IComponentHandle<ISharedMap>>(`syncedState-${syncedStateId}`);
    if (rootStateHandle !== undefined) {
        const rootState = componentMap.get(rootStateHandle.path)?.component as SharedMap;
        if (rootState !== undefined) {
            const fluidState = {};
            for (const fluidKey of rootState.keys()) {
                const createCallback = fluidToView?.get(fluidKey as keyof SF)?.sharedObjectCreate;
                let value = rootState.get(fluidKey);
                if (value && createCallback) {
                    const possibleComponentPath = (value as IComponent)?.IComponentHandle?.path;
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
    }
    return;
}
