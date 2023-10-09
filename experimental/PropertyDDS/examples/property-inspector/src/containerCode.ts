/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
// eslint-disable-next-line import/no-deprecated
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { PropertyTreeInstantiationFactory, IPropertyTree } from "./dataObject";

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
		// eslint-disable-next-line import/no-deprecated
		const propertyTree = await requestFluidObject<IPropertyTree>(
			await runtime.getRootDataStore(propertyTreeId),
			"",
		);
		return new PropertyTreeAppModel(propertyTree);
	}
}
