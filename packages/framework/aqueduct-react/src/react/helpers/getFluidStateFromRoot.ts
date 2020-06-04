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
    initialFluidState: SF,
    fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>,
): SF {
    const rootStateHandle = root.get<IComponentHandle<ISharedMap>>(`syncedState-${syncedStateId}`);
    if (rootStateHandle) {
        const rootState = componentMap.get(rootStateHandle.path)?.component as SharedMap;
        if (rootState) {
            const fluidState = {};
            for (const fluidKey of rootState.keys()) {
                const fluidType = fluidToView?.get(fluidKey as keyof SF)?.fluidObjectType;
                const rootKey = fluidToView?.get(fluidKey as keyof SF)?.rootKey;
                let value = rootKey ? root.get(rootKey) : rootState.get(fluidKey);
                if (value && fluidType) {
                    const possibleComponentPath = (value as IComponent)?.IComponentHandle?.path;
                    if (possibleComponentPath !== undefined) {
                        value = componentMap.get(possibleComponentPath);
                        fluidState[fluidKey] = value.component;
                    } else {
                        fluidState[fluidKey] = value;
                    }
                } else {
                    fluidState[fluidKey] = value;
                }
            }
            return { ...initialFluidState, ...fluidState };
        }
    }
    return initialFluidState;
}
