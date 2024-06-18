/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";

import { type IPropertyTree, PropertyTreeInstantiationFactory } from "./dataObject.js";

/**
 * The data model for our application.
 *
 * @remarks Since this is a simple example it's just a single data object.  More advanced scenarios may have more
 * complex models.
 */
export interface IPropertyTreeAppModel {
	readonly propertyTree: IPropertyTree;
}

class PropertyTreeAppModel implements IPropertyTreeAppModel {
	public constructor(public readonly propertyTree: IPropertyTree) {}
}

const propertyTreeId = "property-tree";

/**
 * The runtime factory for our Fluid container.
 */
export class PropertyTreeContainerRuntimeFactory extends ModelContainerRuntimeFactory<IPropertyTreeAppModel> {
	constructor() {
		super(
			new Map([["property-tree", Promise.resolve(PropertyTreeInstantiationFactory)]]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const propertyTree = await runtime.createDataStore(PropertyTreeInstantiationFactory.type);
		await propertyTree.trySetAlias(propertyTreeId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		return new PropertyTreeAppModel(
			await getDataStoreEntryPoint<IPropertyTree>(runtime, propertyTreeId),
		);
	}
}
