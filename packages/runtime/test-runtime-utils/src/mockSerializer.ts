/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IFluidHandle,
    IFluidSerializer,
} from "@fluidframework/core-interfaces";

/**
 * Mock serializer implementation
 */
export class MockSerializer implements IFluidSerializer {
    public constructor() {}

    public get IFluidSerializer() { return this; }

    public replaceHandles(
        input: any,
        bind: IFluidHandle,
    ) {
        throw new Error("Method not implemented.");
    }

    public stringify(input: any, bind: IFluidHandle) {
        assert(bind === undefined, "Mock serializer should not be called with bind handles");
        return JSON.stringify(input);
    }

    // Parses the serialized data - context must match the context with which the JSON was stringified
    public parse(input: string) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(input);
    }
}
