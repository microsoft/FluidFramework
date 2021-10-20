/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IFluidHandle,
    IFluidSerializer,
} from "@fluidframework/core-interfaces";

/**
 * Test serializer implementation for merge tree tests
 */
export class TestSerializer implements IFluidSerializer {
    public constructor() {}

    public get IFluidSerializer() { return this; }

    public replaceHandles(
        input: any,
        bind: IFluidHandle,
    ) {
        throw new Error("Method not implemented.");
    }

    public stringify(value: any, bind: IFluidHandle) {
        assert(bind === undefined, "Test serializer should not be called with bind handles");
        return JSON.stringify(value);
    }

    public parse(value: string) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(value);
    }
}
