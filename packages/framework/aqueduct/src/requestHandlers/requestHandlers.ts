/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    componentRuntimeRequestHandler,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import { IComponentMountableViewClass } from "@microsoft/fluid-view-interfaces";

/**
 * A mountable view is only required if the view needs to be mounted across a bundle boundary.  Mounting across
 * bundle boundaries breaks some frameworks, so the mountable view is used to ensure the mounting is done within
 * the same bundle as the view.  For example, React hooks don't work if mounted across bundles since there will
 * be two React instances, breaking the Rules of Hooks.  When cross-bundle mounting isn't required, the mountable
 * view isn't necessary.
 *
 * When a request is received with a mountableView: true header, this request handler will reissue the request
 * without the header, and respond with a mountable view of the given class using the response.
 * @param MountableViewClass - The type of mountable view to use when responding
 */
export const mountableViewRequestHandler: (MountableViewClass: IComponentMountableViewClass) => RuntimeRequestHandler =
    (MountableViewClass: IComponentMountableViewClass) => {
        return async (request: RequestParser, runtime: IContainerRuntime) => {
            if (request.headers?.mountableView === true) {
                // Reissue the request without the mountableView header.
                // We'll repack whatever the response is if we can.
                const headers = { ...request.headers };
                delete headers.mountableView;
                const newRequest = new RequestParser({
                    url: request.url,
                    headers,
                });
                const response = await runtime.request(newRequest);

                if (response.status === 200 && MountableViewClass.canMount(response.value)) {
                    return {
                        status: 200,
                        mimeType: "fluid/component",
                        value: new MountableViewClass(response.value),
                    };
                }
            }
        };
    };

/**
 * Reissue empty requests as requests for the component at the ID provided.
 * @param defaultComponentId - The ID of the default component
 */
export const defaultComponentRuntimeRequestHandler: (defaultComponentId: string) => RuntimeRequestHandler =
    (defaultComponentId: string) => {
        return async (request: RequestParser, runtime: IContainerRuntime) => {
            if (request.pathParts.length === 0) {
                return componentRuntimeRequestHandler(
                    new RequestParser({
                        url: defaultComponentId,
                        headers: request.headers,
                    }),
                    runtime);
            }
            return undefined;
        };
    };
