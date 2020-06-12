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

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

const simpleCoordinateComponentId = "simpleCoordinate";
const triangleCoordinateComponentId1 = "triangle1";
const triangleCoordinateComponentId2 = "triangle2";
const triangleCoordinateComponentId3 = "triangle3";

const registryEntries = new Map([
    CoordinateInstantiationFactory.registryEntry,
]);

/**
 * Our default view demos two scenarios - one basic that takes a single coordinate, and one triangle that takes 3.
 */
interface IDefaultViewProps {
    simpleCoordinate: ICoordinate;
    triangleCoordinate1: ICoordinate;
    triangleCoordinate2: ICoordinate;
    triangleCoordinate3: ICoordinate;
}

/**
 * In this sample, we (the container author) are choosing to bring along our own view that composes several
 * component views together.  We could have alternatively built a "base" component to do this composition if we had
 * preferred - either works fine.
 */
const DefaultView: React.FC<IDefaultViewProps> = (props: IDefaultViewProps) => {
    return (
        <div>
            <div>
                <h2 className="scenario-header">Scenario 1: Linking a single model to multiple views</h2>
                <SliderCoordinateView model={props.simpleCoordinate} label="Simple Coordinate" />
                <PlotCoordinateView model={props.simpleCoordinate} />
            </div>
            <div>
                <h2 className="scenario-header">Scenario 2: Using multiple models in a single view</h2>
                <SliderCoordinateView model={props.triangleCoordinate1} label="Triangle pt1" />
                <SliderCoordinateView model={props.triangleCoordinate2} label="Triangle pt2" />
                <SliderCoordinateView model={props.triangleCoordinate3} label="Triangle pt3" />
                <TriangleView
                    coordinate1={props.triangleCoordinate1}
                    coordinate2={props.triangleCoordinate2}
                    coordinate3={props.triangleCoordinate3}
                />
            </div>
        </div>
    );
};

// Just a little helper, since we're going to create multiple coordinates.
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

// Just a little helper, since we're going to request multiple coordinates.
const requestCoordinateFromId = async (request: RequestParser, runtime: IContainerRuntime, id: string) => {
    const coordinateRequest = new RequestParser({
        url: `${id}`,
        headers: request.headers,
    });
    const coordinate = (await runtime.request(coordinateRequest)).value as Coordinate;
    return coordinate;
};

/**
 * When someone requests the default view off our container ("/"), we'll respond with a DefaultView.  To do so,
 * we need to retrieve those data models we created in containerInitializingFirstTime.
 */
const defaultViewRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            const simpleCoordinate = await requestCoordinateFromId(request, runtime, simpleCoordinateComponentId);
            const triangleCoordinate1 = await requestCoordinateFromId(request, runtime, triangleCoordinateComponentId1);
            const triangleCoordinate2 = await requestCoordinateFromId(request, runtime, triangleCoordinateComponentId2);
            const triangleCoordinate3 = await requestCoordinateFromId(request, runtime, triangleCoordinateComponentId3);
            const viewResponse = (
                <DefaultView
                    simpleCoordinate={simpleCoordinate}
                    triangleCoordinate1={triangleCoordinate1}
                    triangleCoordinate2={triangleCoordinate2}
                    triangleCoordinate3={triangleCoordinate3}
                />
            );
            return { status: 200, mimeType: "fluid/view", value: viewResponse };
        }
    };

// We'll use a MountableView so webpack-component-loader can display us, and add our default view request handler.
const viewRequestHandlers = [
    mountableViewRequestHandler(MountableView),
    defaultViewRequestHandler,
];

export class CoordinateContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(registryEntries, [], viewRequestHandlers);
    }

    /**
     * Since we're letting the container define the default view it will respond with, it must do whatever setup
     * it requires to produce that default view.  We'll create a few Coordinates and give them starting values.
     */
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
