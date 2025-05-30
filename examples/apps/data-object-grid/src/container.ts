/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";

import { DataObjectGrid, IDataObjectGrid } from "./dataObjectGrid.js";
import type { ISingleHandleItem } from "./dataObjectRegistry.js";

/**
 * The data model for our application.
 *
 * @remarks Since this is a simple example it's just a single data object.  More advanced scenarios may have more
 * complex models.
 */
export interface IDataObjectGridAppModel {
	readonly dataObjectGrid: IDataObjectGrid<ISingleHandleItem>;
}

class DataObjectGridAppModel implements IDataObjectGridAppModel {
	public constructor(public readonly dataObjectGrid: IDataObjectGrid<ISingleHandleItem>) {}
}

const dataObjectGridId = "data-object-grid";

/**
 * The runtime factory for our Fluid container.
 */
export class DataObjectGridContainerRuntimeFactory extends ModelContainerRuntimeFactory<IDataObjectGridAppModel> {
	constructor() {
		super(
			new Map([DataObjectGrid.getFactory().registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const dataObjectGrid = await runtime.createDataStore(DataObjectGrid.getFactory().type);
		await dataObjectGrid.trySetAlias(dataObjectGridId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(
		runtime: IContainerRuntime,
		container: IContainer,
	): Promise<DataObjectGridAppModel> {
		return new DataObjectGridAppModel(
			await getDataStoreEntryPoint<IDataObjectGrid<ISingleHandleItem>>(
				runtime,
				dataObjectGridId,
			),
		);
	}
}
