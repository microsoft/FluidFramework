/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";

export function setFluidStateToRoot<SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    fluidState: SF,
): void {
    const convertedState = {};
    Object.entries(fluidState).forEach(([fluidKey, fluidValue]) => {
        if (fluidValue.IComponentLoadable) {
            convertedState[fluidKey] = fluidValue.IComponentLoadable.handle;
        } else {
            convertedState[fluidKey] = fluidValue;
        }
    });
    root.set(`syncedState-${syncedStateId}`, convertedState);
}
