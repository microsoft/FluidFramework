/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ComponentHandle } from "@fluidframework/component-runtime";
import { IComponentHandle, IRequest, IResponse } from "@fluidframework/component-core-interfaces";

// TODO #2425 Expose Summarizer handle as ComponentHandle w/ tests
export class SummarizerHandle extends ComponentHandle {
    public async get(): Promise<any> {
        throw Error("Do not try to get a summarizer object from the handle. Reference it directly.");
    }

    public attach(): void {
        return;
    }

    public bind(handle: IComponentHandle) {
        return;
    }

    public async request(request: IRequest): Promise<IResponse> {
        throw Error("Do not try to request on a summarizer handle object.");
    }
}
