/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionMode } from "@fluidframework/protocol-definitions";

export interface IConnectionArgs {
    mode?: ConnectionMode;
    fetchOpsFromStorage?: boolean;
    reason: string;
}
