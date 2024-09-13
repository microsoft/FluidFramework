/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntime } from "@fluidframework/container-definitions/internal";

import type { ContainerExtensionStore } from "./containerExtensions.js";

/**
 * @internal
 */
export interface IRuntimeInternal extends IRuntime, ContainerExtensionStore {}
