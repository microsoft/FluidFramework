/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import { RequestParser, requestFluidObject } from "@fluidframework/runtime-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { MountableView } from "@fluidframework/view-adapters";
import { Constellation } from "@fluid-example/multiview-constellation-model";
import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";

import * as React from "react";

import { DefaultView } from "./defaultView";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

const simpleCoordinateComponentId = "simpleCoordinate";
const triangleCoordinateComponentId1 = "triangle1";
const triangleCoordinateComponentId2 = "triangle2";
const triangleCoordinateComponentId3 = "triangle3";
const constellationComponentName = "constellation";

const registryEntries = new Map([
    Coordinate.getFactory().registryEntry,
    Constellation.getFactory().registryEntry,
]);

// Just a little helper, since we're going to create multiple coordinates.
const createAndAttachCoordinate = async (runtime: IContainerRuntime, name: string) => {
    const dataStore = await runtime.createDataStore(Coordinate.getFactory().type);
    const aliasResult = await dataStore.trySetAlias(name);
    const simpleCoordinateComponentRuntime =
        aliasResult === "Success" ? dataStore : await runtime.getRootDataStore(name);

    return requestFluidObject<ICoordinate>(simpleCoordinateComponentRuntime, "/");
};

// Just a little helper, since we're going to request multiple coordinates.
async function requestObjectStoreFromId<T>(request: RequestParser, runtime: IContainerRuntime, id: string) {
    const coordinateRequest = RequestParser.create({
        url: ``,
        headers: request.headers,
    });
    return requestFluidObject<T>(
        await runtime.getRootDataStore(id),
        coordinateRequest);
}

/**
 * When someone requests the default view off our container ("/"), we'll respond with a DefaultView.  To do so,
 * we need to retrieve those data models we created in containerInitializingFirstTime.
 */
const defaultViewRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            const simpleCoordinate = await requestObjectStoreFromId<Coordinate>(
                request, runtime, simpleCoordinateComponentId);
            const triangleCoordinate1 = await requestObjectStoreFromId<Coordinate>(
                request, runtime, triangleCoordinateComponentId1);
            const triangleCoordinate2 = await requestObjectStoreFromId<Coordinate>(
                request, runtime, triangleCoordinateComponentId2);
            const triangleCoordinate3 = await requestObjectStoreFromId<Coordinate>(
                request, runtime, triangleCoordinateComponentId3);
            const constellation = await requestObjectStoreFromId<Constellation>(
                request, runtime, constellationComponentName);
            const viewResponse = (
                <DefaultView
                    simpleCoordinate={simpleCoordinate}
                    triangleCoordinate1={triangleCoordinate1}
                    triangleCoordinate2={triangleCoordinate2}
                    triangleCoordinate3={triangleCoordinate3}
                    constellation={constellation}
                />
            );
            return { status: 200, mimeType: "fluid/view", value: viewResponse };
        }
    };

export class CoordinateContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        // We'll use a MountableView so webpack-fluid-loader can display us,
        // and add our default view request handler.
        super(registryEntries, undefined, [mountableViewRequestHandler(MountableView, [defaultViewRequestHandler])]);
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

        // Create the constellation component
        const dataStore = await runtime.createDataStore(Constellation.getFactory().type);
        const aliasResult = await dataStore.trySetAlias(constellationComponentName);
        const component =
            aliasResult === "Success" ? dataStore : await runtime.getRootDataStore(constellationComponentName);
        const constellationComponent = await requestFluidObject<Constellation>(component, "/");

        // Add a few stars
        await constellationComponent.addStar(86, 74);
        await constellationComponent.addStar(70, 86);
        await constellationComponent.addStar(44, 72);
        await constellationComponent.addStar(48, 55);
        await constellationComponent.addStar(40, 39);
        await constellationComponent.addStar(29, 27);
        await constellationComponent.addStar(7, 17);
    }
}
