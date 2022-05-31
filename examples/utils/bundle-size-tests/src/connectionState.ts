/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@fluidframework/container-loader";

/**
 * This was added to test the bundle size for cases when ConnectionState is used separately.
 */
export function apisToBundle() {
    // Pass through dummy parameters, this file is only used for bundle analysis
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    ConnectionState.Connected;
}
