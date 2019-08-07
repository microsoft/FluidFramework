/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IRequest } from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { SharedMap } from "@prague/map";
import { IComponentContext, IComponentFactory } from "@prague/runtime-definitions";
import { PinpointRunner } from "./runner";

class PinpointMapsFactory implements IComponent, IComponentFactory {
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
                        : { status: 200, mimeType: "prague/component", value: runner };
                });
            });
    }
}

export const fluidExport = new PinpointMapsFactory();

export function instantiateComponent(context: IComponentContext): void {
    fluidExport.instantiateComponent(context);
}
