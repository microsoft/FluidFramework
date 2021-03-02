/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidHandleContext, IRequest } from "@fluidframework/core-interfaces";

export class MockHandleContext implements IFluidHandleContext {
    public isAttached = false;
    public get IFluidHandleContext() {
        return this;
    }

    constructor(public readonly absolutePath = "", public readonly routeContext?: IFluidHandleContext) {}

    public attachGraph() {
        throw new Error("Method not implemented.");
    }

    public async resolveHandle(request: IRequest) {
        return { status: 404, mimeType: "text/plain", value: `Method not implemented.` };
    }

    public async addRoute() {
        throw new Error("Method not implemented");
    }
}

export const mockHandleContext: IFluidHandleContext = new MockHandleContext();
