/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { TimestampWatcher } from "./dataObject";

export interface ITimestampWatcherAppModel {
	readonly timestampWatcher: TimestampWatcher;
}

class TimestampWatcherAppModel implements ITimestampWatcherAppModel {
	public constructor(public readonly timestampWatcher: TimestampWatcher) {}
}

const timestampWatcherId = "time-stamp-watcher";

export class TimestampWatcherContainerRuntimeFactory extends ModelContainerRuntimeFactory<ITimestampWatcherAppModel> {
	constructor() {
		super(
			new Map([TimestampWatcher.getFactory().registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const timestampWatcher = await runtime.createDataStore(TimestampWatcher.getFactory().type);
		await timestampWatcher.trySetAlias(timestampWatcherId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const timestampWatcher = await requestFluidObject<TimestampWatcher>(
			await runtime.getRootDataStore(timestampWatcherId),
			"",
		);
		return new TimestampWatcherAppModel(timestampWatcher);
	}
}
