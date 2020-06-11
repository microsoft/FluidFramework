/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { RequestParser, RuntimeRequestHandler } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { MountableView } from "@fluidframework/view-adapters";
import { Coordinate, CoordinateInstantiationFactory } from "@fluid-example/multiview-coordinate-model";
import { CoordinateView } from "@fluid-example/multiview-coordinate-view";

import * as React from "react";

const coordinateComponentId = "coordinate";

const registryEntries = new Map([
    CoordinateInstantiationFactory.registryEntry,
]);

const defaultViewRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            const modelRequest = new RequestParser({
                url: `${coordinateComponentId}`,
                headers: request.headers,
            });
            const model = (await runtime.request(modelRequest)).value as Coordinate;
            return { status: 200, mimeType: "fluid/view", value: <CoordinateView model={model} /> };
        }
    };

const viewRequestHandlers = [
    mountableViewRequestHandler(MountableView),
    defaultViewRequestHandler,
];

export class CoordinateContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(registryEntries, [], viewRequestHandlers);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const componentRuntime = await runtime.createComponent(coordinateComponentId, Coordinate.ComponentName);
        const result = await componentRuntime.request({ url: coordinateComponentId });
        if (result.status !== 200 || result.mimeType !== "fluid/component") {
            throw new Error("Error in creating the default option picker model.");
        }

        componentRuntime.attach();
    }
}
