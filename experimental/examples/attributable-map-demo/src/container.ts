/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { AttributableMapPage } from "./fluid-object";

export interface IAttributableMapPageAppModel {
	readonly attributableMapPage: AttributableMapPage;
}

class AttributableMapPageAppModel implements IAttributableMapPageAppModel {
	public constructor(public readonly attributableMapPage: AttributableMapPage) {}
}

const attributableMapPageId = "attributable-map-page";

export class AttributableMapPageContainerRuntimeFactory extends ModelContainerRuntimeFactory<IAttributableMapPageAppModel> {
	constructor() {
		super(
			new Map([AttributableMapPage.getFactory().registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const attributableMapPage = await runtime.createDataStore(
			AttributableMapPage.getFactory().type,
		);
		await attributableMapPage.trySetAlias(attributableMapPageId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const attributableMapPage = await requestFluidObject<AttributableMapPage>(
			await runtime.getRootDataStore(attributableMapPageId),
			"",
		);
		return new AttributableMapPageAppModel(attributableMapPage);
	}
}
