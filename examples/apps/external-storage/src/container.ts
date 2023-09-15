/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { LoadableDataObject } from "@fluid-experimental/to-non-fluid";
import { ChildDataObject, RootDataObject } from "./fluid-object";

const aliasId = "alias-id";

export class DownloadableRootViewContainerRuntimeFactory extends ModelContainerRuntimeFactory<RootDataObject> {
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
		await collaborativeText.trySetAlias(aliasId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		return requestFluidObject<RootDataObject>(await runtime.getRootDataStore(aliasId), "");
	}
}

export class DownloadableViewContainerRuntimeFactory extends ModelContainerRuntimeFactory<LoadableDataObject> {
	constructor() {
		super(
			new Map([
				LoadableDataObject.factory.registryEntry,
				[
					RootDataObject.factory.type,
					Promise.resolve(LoadableDataObject.getFactory(RootDataObject.factory.type)),
				],
				[
					ChildDataObject.factory.type,
					Promise.resolve(LoadableDataObject.getFactory(ChildDataObject.factory.type)),
				],
			]), // registryEntries
		);
	}

	private defaultType: string = LoadableDataObject.factory.type;
	public setDefaultType(type: string) {
		this.defaultType = type;
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const collaborativeText = await runtime.createDataStore(this.defaultType);
		await collaborativeText.trySetAlias(aliasId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		return requestFluidObject<LoadableDataObject>(await runtime.getRootDataStore(aliasId), "");
	}
}
