/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMap } from "@fluidframework/map";
import { IQuorum } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/component-runtime-definitions";

export interface IFluidGameConfig {
    userId: string;
    gameState: SharedMap,
    quorum: IQuorum,
    runtime: IFluidDataStoreRuntime
}
