/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FluidObjectHandle } from "@fluidframework/datastore";
import { IFluidHandle } from "@fluidframework/core-interfaces";

// TODO #2425 Expose Summarizer handle as FluidObjectHandle w/ tests
export class SummarizerHandle extends FluidObjectHandle {
    public async get(): Promise<any> {
        throw Error("Do not try to get a summarizer object from the handle. Reference it directly.");
    }

    public attach(): void {
        return;
    }

    public bind(handle: IFluidHandle): void {
        return;
    }
}
