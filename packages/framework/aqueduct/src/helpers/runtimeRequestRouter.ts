/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IComponent } from "@microsoft/fluid-container-definitions";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { SimpleContainerRuntimeFactory } from "./simpleContainerRuntimeFactory";

export type RuntimeRequestHandler = (request: IRequest, runtime: IHostRuntime) => Promise<IResponse | undefined>;

export class RuntimeRequestHandlerBuilder {
    private readonly handlers: RuntimeRequestHandler[] = [];

    constructor(...handlers: RuntimeRequestHandler[]) {
        this.addHandlers(...handlers);
    }

    public createRequestHandler(runtime: IHostRuntime): (request: IRequest) => Promise<IResponse> {
        return async (request: IRequest) => {
            for (const handler of this.handlers) {
                const response = await  handler(request, runtime);
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

export const componentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: IRequest, runtime: IHostRuntime) => {
        // debug(`request(url=${request.url})`);

        // Trim off an opening slash if it exists
        const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
            ? request.url.substr(1)
            : request.url;

        // Get the next slash to identify the componentID (if it exists)
        const trailingSlash = requestUrl.indexOf("/");

        // retrieve the component ID. If from a URL we need to decode the URI component
        const componentId = requestUrl
            ? decodeURIComponent(requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash))
            : SimpleContainerRuntimeFactory.defaultComponentId;

        // Pull the part of the URL after the component ID
        const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : "";

        let wait = true;
        if (request.headers && (typeof request.headers.wait) === "boolean") {
            wait = request.headers.wait as boolean;
        }

        // debug(`awaiting component ${componentId}`);
        const component = await runtime.getComponentRuntime(componentId, wait);
        // debug(`have component ${componentId}`);

        // And then defer the handling of the request to the component
        return component.request({ url: pathForComponent });
    };

export function createServiceRuntimeRequestHandler(serviceId: string, component: IComponent): RuntimeRequestHandler {
    return async (request: IRequest, runtime: IHostRuntime) => {

        const requestParts = request.url.split("/").reduce<string[]>(
            (pv, cv) => {
                if (cv !== undefined && cv.length > 0) {
                    pv.push(cv);
                }
                return pv;
            },
            []);

        if (requestParts.length >= 2
            && requestParts[0] === "_services"
            && requestParts[1] === serviceId) {
            if (requestParts.length === 2) {
                return {
                    mimeType: "fluid/component",
                    status: 200,
                    value: component,
                };
            }
        }

        return undefined;
    };
}
