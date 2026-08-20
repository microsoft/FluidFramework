/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/legacy";

/**
 * Compatibility setting shared by examples that are built and deployed with the current Client
 * release rather than supporting an older deployed application.
 *
 * @internal
 */
export const exampleOldestSupportedClient: OldestSupportedClientVersion = "3.0.0";
