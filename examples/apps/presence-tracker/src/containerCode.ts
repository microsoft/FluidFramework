/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory, getDataStoreEntryPoint } from "@fluid-example/example-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IContainer } from "@fluidframework/container-definitions";
import { Signaler } from "@fluid-experimental/data-objects";
import { createServiceAudience } from "@fluidframework/fluid-static";
import { FocusTracker } from "./FocusTracker";
import { MouseTracker } from "./MouseTracker";
import { createMockServiceMember } from "./Audience";

export interface ITrackerAppModel {
	readonly focusTracker: FocusTracker;
	readonly mouseTracker: MouseTracker;
}

class TrackerAppModel implements ITrackerAppModel {
	public constructor(
		public readonly focusTracker: FocusTracker,
		public readonly mouseTracker: MouseTracker,
	) {}
}

const signalerId = "signaler";

export class TrackerContainerRuntimeFactory extends ModelContainerRuntimeFactory<ITrackerAppModel> {
	constructor() {
		super(
			new Map([Signaler.factory.registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const signaler = await runtime.createDataStore(Signaler.factory.type);
		await signaler.trySetAlias(signalerId);
	}

	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const signaler = await getDataStoreEntryPoint<Signaler>(runtime, signalerId);

		const audience = createServiceAudience({
			container,
			createServiceMember: createMockServiceMember,
		});

		const focusTracker = new FocusTracker(container, audience, signaler);

		const mouseTracker = new MouseTracker(audience, signaler);

		return new TrackerAppModel(focusTracker, mouseTracker);
	}
}
