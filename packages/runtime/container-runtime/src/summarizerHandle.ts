/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { FluidOjectHandle } from "@fluidframework/datastore";
import { IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";

// TODO: Fix FluidOjectHandle -> FluidObjectHandle in component-runtime package
// TODO #2425 Expose Summarizer handle as FluidOjectHandle w/ tests
export class SummarizerHandle extends FluidOjectHandle {
    public async get(): Promise<any> {
        throw Error("Do not try to get a summarizer object from the handle. Reference it directly.");
    }

    public attach(): void {
        return;
    }

    public bind(handle: IFluidHandle) {
        return;
    }

    public async request(request: IRequest): Promise<IResponse> {
        throw Error("Do not try to request on a summarizer handle object.");
    }
}
