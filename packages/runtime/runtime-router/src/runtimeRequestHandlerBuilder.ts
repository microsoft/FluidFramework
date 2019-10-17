/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser } from "./requestParser";

export type RuntimeRequestDelegate = (request: RequestParser, runtime: IHostRuntime) => Promise<IResponse | undefined>;

 /**
  * The RuntimeRequestHandlerBuilder creates a runtime request handler based on request handlers.
  * The provided handlers sequentially applied until one is able to statify the request.
  */
export class RuntimeRequestHandlerBuilder {
    private readonly handlers: RuntimeRequestDelegate[] = [];

    public get requestHandlerFn(): ((request: IRequest, runtime: IHostRuntime) => Promise<IResponse>) {
        return this.handleRequest.bind(this);
    }

    public pushHandler(...handlers: RuntimeRequestDelegate[]) {
        if (handlers !== undefined) {
            this.handlers.push(...handlers);
        }
    }

    private async handleRequest(request: IRequest, runtime: IHostRuntime): Promise<IResponse> {
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
