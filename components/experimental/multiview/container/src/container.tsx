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
import { TriangleView } from "@fluid-example/multiview-triangle-view";

import * as React from "react";

const simpleCoordinateComponentId = "simpleCoordinate";
const triangleCoordinateComponentId1 = "triangle1";
const triangleCoordinateComponentId2 = "triangle2";
const triangleCoordinateComponentId3 = "triangle3";

const registryEntries = new Map([
    CoordinateInstantiationFactory.registryEntry,
]);

interface IDefaultViewProps {
    simpleCoordinate: ICoordinate;
    triangleCoordinate1: ICoordinate;
    triangleCoordinate2: ICoordinate;
    triangleCoordinate3: ICoordinate;
}

const DefaultView: React.FC<IDefaultViewProps> = (props: IDefaultViewProps) => {
    return (
        <div>
            <div>
                Scenario 1: Linking a single model to multiple views
                <SliderCoordinateView model={ props.simpleCoordinate } label="Simple Coordinate" />
                <PlotCoordinateView model={ props.simpleCoordinate } />
            </div>
            <div>
                Scenario 2: Using multiple models in a single view
                <SliderCoordinateView model={ props.triangleCoordinate1 } label="Triangle pt1" />
                <SliderCoordinateView model={ props.triangleCoordinate2 } label="Triangle pt2" />
                <SliderCoordinateView model={ props.triangleCoordinate3 } label="Triangle pt3" />
                <TriangleView
                    coordinate1={ props.triangleCoordinate1 }
                    coordinate2={ props.triangleCoordinate2 }
                    coordinate3={ props.triangleCoordinate3 }
                />
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
            const simpleCoordinate = await requestCoordinateFromId(request, runtime, simpleCoordinateComponentId);
            const triangleCoordinate1 = await requestCoordinateFromId(request, runtime, triangleCoordinateComponentId1);
            const triangleCoordinate2 = await requestCoordinateFromId(request, runtime, triangleCoordinateComponentId2);
            const triangleCoordinate3 = await requestCoordinateFromId(request, runtime, triangleCoordinateComponentId3);
            const viewResponse = (
                <DefaultView
                    simpleCoordinate={ simpleCoordinate }
                    triangleCoordinate1={ triangleCoordinate1 }
                    triangleCoordinate2={ triangleCoordinate2 }
                    triangleCoordinate3={ triangleCoordinate3 }
                />
            )
            return { status: 200, mimeType: "fluid/view", value: viewResponse };
        }
    };

const createAndAttachCoordinate = async (runtime: IContainerRuntime, id: string) => {
    const simpleCoordinateComponentRuntime =
        await runtime.createComponent(id, Coordinate.ComponentName);
    const simpleResult = await simpleCoordinateComponentRuntime.request({ url: id });
    if (simpleResult.status !== 200 || simpleResult.mimeType !== "fluid/component") {
        throw new Error("Error in creating the default option picker model.");
    }
    simpleCoordinateComponentRuntime.attach();
    return simpleResult.value as ICoordinate;
};

const requestCoordinateFromId = async (request: RequestParser, runtime: IContainerRuntime, id: string) => {
    const coordinateRequest = new RequestParser({
        url: `${id}`,
        headers: request.headers,
    });
    const coordinate = (await runtime.request(coordinateRequest)).value as Coordinate;
    return coordinate;
}

const viewRequestHandlers = [
    mountableViewRequestHandler(MountableView),
    defaultViewRequestHandler,
];

export class CoordinateContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(registryEntries, [], viewRequestHandlers);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const simpleCoordinate = await createAndAttachCoordinate(runtime, simpleCoordinateComponentId);

        simpleCoordinate.x = 30;
        simpleCoordinate.y = 40;

        const triangleCoordinate1 = await createAndAttachCoordinate(runtime, triangleCoordinateComponentId1);
        const triangleCoordinate2 = await createAndAttachCoordinate(runtime, triangleCoordinateComponentId2);
        const triangleCoordinate3 = await createAndAttachCoordinate(runtime, triangleCoordinateComponentId3);

        triangleCoordinate1.x = 25;
        triangleCoordinate1.y = 20;

        triangleCoordinate2.x = 10;
        triangleCoordinate2.y = 80;

        triangleCoordinate3.x = 70;
        triangleCoordinate3.y = 60;
    }
}
