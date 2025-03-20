/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IFluidMountableViewEntryPoint,
	MountableView,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import { Constellation } from "@fluid-example/multiview-constellation-model";
import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";
import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import { FluidObject } from "@fluidframework/core-interfaces";
import * as React from "react";

import { DefaultView } from "./defaultView.js";

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
const createAndAttachCoordinate = async (
	runtime: IContainerRuntime,
	name: string,
): Promise<ICoordinate> => {
	const dataStore = await runtime.createDataStore(Coordinate.getFactory().type);
	await dataStore.trySetAlias(name);

	return getDataStoreEntryPoint<ICoordinate>(runtime, name);
};

export class CoordinateContainerRuntimeFactory extends BaseContainerRuntimeFactory {
	constructor() {
		// We'll use a MountableView so webpack-fluid-loader can display us,
		// and add our default view request handler.
		super({
			registryEntries,
			provideEntryPoint: async (
				containerRuntime: IContainerRuntime,
			): Promise<IFluidMountableViewEntryPoint> => {
				const simpleCoordinate = await getDataStoreEntryPoint<Coordinate>(
					containerRuntime,
					simpleCoordinateComponentId,
				);
				const triangleCoordinate1 = await getDataStoreEntryPoint<Coordinate>(
					containerRuntime,
					triangleCoordinateComponentId1,
				);
				const triangleCoordinate2 = await getDataStoreEntryPoint<Coordinate>(
					containerRuntime,
					triangleCoordinateComponentId2,
				);
				const triangleCoordinate3 = await getDataStoreEntryPoint<Coordinate>(
					containerRuntime,
					triangleCoordinateComponentId3,
				);
				const constellation = await getDataStoreEntryPoint<Constellation>(
					containerRuntime,
					constellationComponentName,
				);
				/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-function-return-type */
				const view = (
					<DefaultView
						simpleCoordinate={simpleCoordinate}
						triangleCoordinate1={triangleCoordinate1}
						triangleCoordinate2={triangleCoordinate2}
						triangleCoordinate3={triangleCoordinate3}
						constellation={constellation}
					/>
				) as any;

				let getMountableDefaultView = async () => view;
				if (MountableView.canMount(view)) {
					getMountableDefaultView = async () => new MountableView(view);
				}

				return {
					getDefaultDataObject: async (): Promise<FluidObject> => ({}),
					getMountableDefaultView,
				};
				/* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-function-return-type */
			},
		});
	}

	/**
	 * Since we're letting the container define the default view it will respond with, it must do whatever setup
	 * it requires to produce that default view.  We'll create a few Coordinates and give them starting values.
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const simpleCoordinate = await createAndAttachCoordinate(
			runtime,
			simpleCoordinateComponentId,
		);

		simpleCoordinate.x = 30;
		simpleCoordinate.y = 40;

		const triangleCoordinate1 = await createAndAttachCoordinate(
			runtime,
			triangleCoordinateComponentId1,
		);
		const triangleCoordinate2 = await createAndAttachCoordinate(
			runtime,
			triangleCoordinateComponentId2,
		);
		const triangleCoordinate3 = await createAndAttachCoordinate(
			runtime,
			triangleCoordinateComponentId3,
		);

		triangleCoordinate1.x = 25;
		triangleCoordinate1.y = 20;

		triangleCoordinate2.x = 10;
		triangleCoordinate2.y = 80;

		triangleCoordinate3.x = 70;
		triangleCoordinate3.y = 60;

		// Create the constellation component
		const dataStore = await runtime.createDataStore(Constellation.getFactory().type);
		await dataStore.trySetAlias(constellationComponentName);
		const constellationComponent = await getDataStoreEntryPoint<Constellation>(
			runtime,
			constellationComponentName,
		);

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
