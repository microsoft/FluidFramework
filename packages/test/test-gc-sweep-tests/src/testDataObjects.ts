/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject } from "@fluidframework/aqueduct";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

// data store that exposes container runtime for testing.
export class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get dataStoreRuntime(): IFluidDataStoreRuntime {
        return this.runtime;
    }

    public get containerRuntime(): ContainerRuntime {
        return this.context.containerRuntime as ContainerRuntime;
    }

    public get _context() {
        return this.context;
    }
}
