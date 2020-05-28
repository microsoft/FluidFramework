/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import { ISharedDirectory } from "@fluidframework/map";
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
): SF {
    const syncedState = root.get<SF>(`syncedState-${syncedStateId}`);
    if (fluidToView) {
        Object.entries(syncedState).forEach(([fluidKey, fluidValue]) => {
            const fluidType = fluidToView.get(fluidKey as keyof SF)?.fluidObjectType;
            if (fluidType) {
                const rootKey = fluidToView.get(fluidKey as keyof SF)?.rootKey;
                let value = rootKey ? root.get(rootKey) : root.get(fluidKey);
                const possibleComponentPath = (value as IComponent)?.IComponentHandle?.path;
                if (possibleComponentPath !== undefined) {
                    value = componentMap.get(possibleComponentPath);
                    syncedState[fluidKey] = value.component;
                } else {
                    syncedState[fluidKey] = value;
                }
            }
        });
    }
    return syncedState;
}
