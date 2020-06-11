/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { RequestParser, RuntimeRequestHandler } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { MountableView } from "@fluidframework/view-adapters";
import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate, CoordinateInstantiationFactory } from "@fluid-example/multiview-coordinate-model";
import { PlotCoordinateView } from "@fluid-example/multiview-plot-coordinate-view";
import { SliderCoordinateView } from "@fluid-example/multiview-slider-coordinate-view";

import * as React from "react";

const coordinateComponentId = "coordinate";

const registryEntries = new Map([
    CoordinateInstantiationFactory.registryEntry,
]);

interface IDefaultViewProps {
    model: ICoordinate;
}

const DefaultView: React.FC<IDefaultViewProps> = (props: IDefaultViewProps) => {
    return (
        <div>
            <div>
                Simple linking of a single model/view
                <SliderCoordinateView model={props.model} />
            </div>
            <div>
                Swapping out an alternative model/view
                <PlotCoordinateView model={props.model} />
            </div>
            <div>
                Sharing a model between views
            </div>
            <div>
                A view with three models (triangle)
            </div>

            <div>
                A nested scenario
            </div>
            <div>
                An anonymous (nested?) scenario
            </div>
        </div>
    );
};

const defaultViewRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            const modelRequest = new RequestParser({
                url: `${coordinateComponentId}`,
                headers: request.headers,
            });
            const model = (await runtime.request(modelRequest)).value as Coordinate;
            return { status: 200, mimeType: "fluid/view", value: <DefaultView model={model} /> };
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
