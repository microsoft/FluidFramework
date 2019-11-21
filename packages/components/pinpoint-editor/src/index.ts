/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentContext, IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { PinpointRunner } from "./runner";

class PinpointMapsFactory implements IComponentFactory {
    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const modules = new Map<string, any>();

        // Create channel factories
        const mapFactory = SharedMap.getFactory();
        modules.set(mapFactory.type, mapFactory);

        ComponentRuntime.load(
            context,
            modules,
            (runtime) => {
                const runnerP = PinpointRunner.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const runner = await runnerP;
                    return request.url && request.url !== "/"
                        ? { status: 404, mimeType: "text/plain", value: `${request.url} not found` }
                        : { status: 200, mimeType: "fluid/component", value: runner };
                });
            });
    }
}

export const fluidExport = new PinpointMapsFactory();
