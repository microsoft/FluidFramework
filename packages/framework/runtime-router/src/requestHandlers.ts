/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser } from "./requestParser";
import { RuntimeRequestHandler } from "./runtimeRequestHandlerBuilder";

export const componentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {

        if (request.pathParts.length > 0) {
            let wait: boolean | undefined;
            if (request.headers && (typeof request.headers.wait) === "boolean") {
                wait = request.headers.wait as boolean;
            }

            const component = await runtime.getComponentRuntime(decodeURIComponent(request.pathParts[0]), wait);

            return component.request(request.createSubRequest(1));
        }
        return undefined;
    };

export function createServiceRuntimeRequestHandler(
    serviceId: string, initializeServiceComponent: (runtime: IHostRuntime) => IComponent): RuntimeRequestHandler {
    let component: IComponent | undefined;
    return async (request: RequestParser, runtime: IHostRuntime) => {

        if (request.pathParts.length >= 2
            && request.pathParts[0] === "_services"
            && decodeURIComponent(request.pathParts[1]) === serviceId) {

            if (component === undefined) {
                component = initializeServiceComponent(runtime);
            }

            if (request.pathParts.length === 2) {
                return {
                    mimeType: "fluid/component",
                    status: 200,
                    value: component,
                };
            }

            if (component.IComponentRouter) {
                return component.IComponentRouter.request(request.createSubRequest(2));
            }

            return { status: 400, mimeType: "text/plain", value: `${request.url} service is not a router` };
        }

        return undefined;
    };
}
