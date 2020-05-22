/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";
import { IFluidSchemaHandles } from "../interface";

export const getComponentSchemaFromRoot = (
    syncedStateId: string,
    root: ISharedDirectory,
): IFluidSchemaHandles | undefined => root.get<IFluidSchemaHandles>(`componentSchema-${syncedStateId}`);
