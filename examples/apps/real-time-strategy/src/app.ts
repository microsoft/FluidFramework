/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeTextContainerRuntimeFactory } from "./container";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */

export const fluidExport = new CollaborativeTextContainerRuntimeFactory();
