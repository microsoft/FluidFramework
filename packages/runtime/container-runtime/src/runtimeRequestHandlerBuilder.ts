/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import { RuntimeRequestHandler } from "./requestHandlers";
import { RequestParser } from "./requestParser";

/**
  * The RuntimeRequestHandlerBuilder creates a runtime request handler based on request handlers.
  * The provided handlers sequentially applied until one is able to statify the request.
  */
export class RuntimeRequestHandlerBuilder {
    private readonly handlers: RuntimeRequestHandler[] = [];

    public pushHandler(...handlers: RuntimeRequestHandler[]) {
        if (handlers !== undefined) {
            this.handlers.push(...handlers);
        }
    }

    public async handleRequest(request: IRequest, runtime: IContainerRuntime): Promise<IResponse> {
        const parser = new RequestParser(request);
        for (const handler of this.handlers) {
            const response = await handler(parser, runtime);
            if (response !== undefined) {
                return response;
            }
        }
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
