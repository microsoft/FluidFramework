/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { ChildDataObject, RootDataObject } from "./fluid-object";

const collaborativeTextId = "collaborative-text";

export class DownloadableViewContainerRuntimeFactory extends ModelContainerRuntimeFactory<RootDataObject> {
	constructor() {
		super(
			new Map([RootDataObject.factory.registryEntry, ChildDataObject.factory.registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const collaborativeText = await runtime.createDataStore(RootDataObject.factory.type);
		await collaborativeText.trySetAlias(collaborativeTextId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		return requestFluidObject<RootDataObject>(
			await runtime.getRootDataStore(collaborativeTextId),
			"",
		);
	}
}
