/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidSerializer } from "@fluidframework/runtime-utils";

/**
 * Serializer implementation for serializing handles during summary.
 */
export class SummarySerializer extends FluidSerializer {
    private readonly serializedRoutes: Set<string> = new Set();
    public getSerializedRoutes(): string[] {
        return Array.from(this.serializedRoutes);
    }

    protected serializeHandle(handle: IFluidHandle, bind: IFluidHandle) {
        this.serializedRoutes.add(handle.absolutePath);
        return super.serializeHandle(handle, bind);
    }
}
