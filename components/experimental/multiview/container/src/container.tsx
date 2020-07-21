/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import { RequestParser } from "@fluidframework/runtime-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { MountableView } from "@fluidframework/view-adapters";
import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate, CoordinateInstantiationFactory } from "@fluid-example/multiview-coordinate-model";

import * as React from "react";

import { DefaultView } from "./defaultView";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

const simpleCoordinateComponentId = "simpleCoordinate";
const triangleCoordinateComponentId1 = "triangle1";
const triangleCoordinateComponentId2 = "triangle2";
const triangleCoordinateComponentId3 = "triangle3";

const registryEntries = new Map([
    CoordinateInstantiationFactory.registryEntry,
]);

// Just a little helper, since we're going to create multiple coordinates.
const createAndAttachCoordinate = async (runtime: IContainerRuntime, id: string) => {
    const simpleCoordinateComponentRuntime =
        await runtime.createDataStore(id, Coordinate.ComponentName);
    const simpleResult = await simpleCoordinateComponentRuntime.request({ url: id });
    if (simpleResult.status !== 200 || simpleResult.mimeType !== "fluid/component") {
        throw new Error("Error in creating the default option picker model.");
    }
    simpleCoordinateComponentRuntime.bindToContext();
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
