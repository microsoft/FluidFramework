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
    private readonly _serializedRoutes: Set<string> = new Set();
    public get serializedRoutes(): string[] {
        return Array.from(this._serializedRoutes);
    }

    protected serializeHandle(handle: IFluidHandle, bind: IFluidHandle) {
        this._serializedRoutes.add(handle.absolutePath);
        return super.serializeHandle(handle, bind);
    }
}
