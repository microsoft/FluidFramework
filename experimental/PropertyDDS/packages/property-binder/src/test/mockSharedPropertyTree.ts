/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedPropertyTree } from '@fluid-experimental/property-dds';
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

export async function MockSharedPropertyTree() {
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const sharedPropertyTree = new SharedPropertyTree("sharedPropertyTree", dataStoreRuntime as any, SharedPropertyTree.getFactory().attributes, {});
    return sharedPropertyTree;
}
