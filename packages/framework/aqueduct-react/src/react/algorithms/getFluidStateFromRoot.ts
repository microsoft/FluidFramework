/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";
import { IViewConverter } from "..";

export function getFluidStateFromRoot<SV,SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>,
): SF {
    const syncedState = root.get<SF>(`syncedState-${syncedStateId}`);
    if (fluidToView) {
        Object.entries(syncedState).forEach(([fluidKey, fluidValue]) => {
            const fluidType = fluidToView.get(fluidKey as keyof SF)?.fluidObjectType;
            if (fluidType) {
                const rootKey = fluidToView.get(fluidKey as keyof SF)?.rootKey;
                if (rootKey) {
                    syncedState[fluidKey] = root.get(rootKey);
                } else {
                    syncedState[fluidKey] = root.get(fluidKey);
                }
            }
        });
    }
    return syncedState;
}
