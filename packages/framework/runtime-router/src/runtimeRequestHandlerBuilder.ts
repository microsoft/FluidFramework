/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser } from "./requestParser";

export type RuntimeRequestHandler = (request: RequestParser, runtime: IHostRuntime) => Promise<IResponse | undefined>;

 /**
  * The RuntimeRequestHandlerBuilder creates a runtime request handler based on request handlers.
  * The provided handlers sequentially applied until one is able to statify the reques.
  */
export class RuntimeRequestHandlerBuilder {
    private readonly handlers: RuntimeRequestHandler[] = [];

    constructor(...handlers: RuntimeRequestHandler[]) {
        this.addHandlers(...handlers);
    }

    public createRequestHandler(runtime: IHostRuntime): (request: IRequest) => Promise<IResponse> {
        return async (request: IRequest) => {
            const parser = new RequestParser(request);
            for (const handler of this.handlers) {
                const response = await handler(parser, runtime);
                if (response !== undefined) {
                    return response;
                }
            }
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        };
    }

    public addHandlers(...handlers: RuntimeRequestHandler[]) {
        this.handlers.push(...handlers);
    }
}
