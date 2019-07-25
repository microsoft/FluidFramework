/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRuntime } from "@prague/component-runtime";
import { IComponent, IRequest } from "@prague/container-definitions";
import { SharedMap } from "@prague/map";
import { IComponentContext, IComponentFactory } from "@prague/runtime-definitions";
import { PinpointRunner } from "./runner";

class PinpointMapsFactory implements IComponent, IComponentFactory {
    public static interfaces = ["IComponentFactory"];

    public query(id: string): any {
        return PinpointMapsFactory.interfaces.indexOf(id) !== -1 ? exports : undefined;
    }

    public list(): string[] {
        return PinpointMapsFactory.interfaces;
    }

    public instantiateComponent(context: IComponentContext): void {
        const modules = new Map<string, any>();

        // Create channel extensions
        const mapExtension = SharedMap.getFactory();
        modules.set(mapExtension.type, mapExtension);

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
