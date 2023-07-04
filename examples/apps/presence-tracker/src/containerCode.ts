/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IContainer } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IFocusTracker, FocusTrackerInstantiationFactory } from "./FocusTracker";
import { IMouseTracker, MouseTrackerInstantiationFactory } from "./MouseTracker";

export interface ITrackerAppModel {
	readonly focusTracker: IFocusTracker;
	readonly mouseTracker: IMouseTracker;
}

class TrackerAppModel implements ITrackerAppModel {
	public constructor(
		public readonly focusTracker: IFocusTracker,
		public readonly mouseTracker: IMouseTracker,
	) {}
}

const focusTrackerId = "focusTracker";
const mouseTrackerId = "mouseTracker";

export class TrackerContainerRuntimeFactory extends ModelContainerRuntimeFactory<ITrackerAppModel> {
	constructor() {
		super(
			new Map([
				FocusTrackerInstantiationFactory.registryEntry,
				MouseTrackerInstantiationFactory.registryEntry,
			]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const focusTracker = await runtime.createDataStore(FocusTrackerInstantiationFactory.type);
		await focusTracker.trySetAlias(focusTrackerId);

		const mouseTracker = await runtime.createDataStore(MouseTrackerInstantiationFactory.type);
		await mouseTracker.trySetAlias(mouseTrackerId);
	}

	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const focusTracker = await requestFluidObject<IFocusTracker>(
			await runtime.getRootDataStore(focusTrackerId),
			"",
		);
		const mouseTracker = await requestFluidObject<IMouseTracker>(
			await runtime.getRootDataStore(mouseTrackerId),
			"",
		);
		return new TrackerAppModel(focusTracker, mouseTracker);
	}
}
