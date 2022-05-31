/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@fluidframework/container-loader";

// This test was added because we expect ConnectionState to commonly be imported without the rest of the runtime.
export function apisToBundle() {
    // Pass through dummy parameters, this file is only used for bundle analysis
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    ConnectionState.Connected;
}
