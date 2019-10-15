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
    private runtime: IHostRuntime | undefined;

    public get createRequestHandlerFn(): (runtime: IHostRuntime) => ((request: IRequest) => Promise<IResponse>) {
        return this.createRequestHandler.bind(this);
    }

    public pushHandler(...handlers: RuntimeRequestHandler[]) {
        if (handlers !== undefined) {
            this.handlers.push(...handlers);
        }
    }

    private createRequestHandler(runtime: IHostRuntime) {
        this.runtime = runtime;
        return this.handleRequest.bind(this);
    }

    private async handleRequest(request: IRequest): Promise<IResponse> {
        const parser = new RequestParser(request);
        for (const handler of this.handlers) {
            // tslint:disable-next-line: no-non-null-assertion
            const response = await handler(parser, this.runtime!);
            if (response !== undefined) {
                return response;
            }
        }
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
