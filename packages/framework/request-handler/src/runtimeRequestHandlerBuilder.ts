/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RequestParser, create404Response } from "@fluidframework/runtime-utils";
import { RuntimeRequestHandler } from "./requestHandlers";

/**
  * The RuntimeRequestHandlerBuilder creates a runtime request handler based on request handlers.
  * The provided handlers sequentially applied until one is able to satisfy the request.
  */
export class RuntimeRequestHandlerBuilder {
    private readonly handlers: RuntimeRequestHandler[] = [];

    public pushHandler(...handlers: RuntimeRequestHandler[]) {
        if (handlers !== undefined) {
            this.handlers.push(...handlers);
        }
    }

    public async handleRequest(request: IRequest, runtime: IContainerRuntime): Promise<IResponse> {
        const parser = RequestParser.create(request);
        for (const handler of this.handlers) {
            const response = await handler(parser, runtime);
            if (response !== undefined) {
                return response;
            }
        }
        return create404Response(request);
    }
}

export function buildRuntimeRequestHandler(...handlers: RuntimeRequestHandler[]) {
    const builder = new RuntimeRequestHandlerBuilder();
    builder.pushHandler(...handlers);
    return async (request: IRequest, runtime: IContainerRuntime) => builder.handleRequest(request, runtime);
}
