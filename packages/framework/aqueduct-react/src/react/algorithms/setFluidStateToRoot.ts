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
    root.set(`syncedState-${syncedStateId}`, fluidState);
}
