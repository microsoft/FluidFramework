/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";
import { IFluidSchemaHandles } from "../interface";

export function setComponentSchemaToRoot(
    syncedStateId: string,
    root: ISharedDirectory,
    componentSchemaHandles: IFluidSchemaHandles,
): void {
    root.set(`componentSchema-${syncedStateId}`, componentSchemaHandles);
}
