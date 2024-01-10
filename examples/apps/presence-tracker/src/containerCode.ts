/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory, getDataStoreEntryPoint } from "@fluid-example/example-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IContainer } from "@fluidframework/container-definitions";
import { Signaler } from "@fluid-experimental/data-objects";
import { EphemeralIndependentDirectory } from "@fluid-experimental/ephemeral-independent/alpha";
import { createServiceAudience } from "@fluidframework/fluid-static";
import { FocusTracker } from "./FocusTracker.js";
import { MouseTracker } from "./MouseTracker.js";
import { createMockServiceMember } from "./Audience.js";

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
const ephemDirId = "ephemeralDirectory";

export class TrackerContainerRuntimeFactory extends ModelContainerRuntimeFactory<ITrackerAppModel> {
	constructor() {
		super(
			new Map([
				// registryEntries
				Signaler.factory.registryEntry,
				EphemeralIndependentDirectory.factory.registryEntry,
			]),
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		await Promise.all([
			runtime
				.createDataStore(Signaler.factory.type)
				.then(async (signaler) => signaler.trySetAlias(signalerId)),
			runtime
				.createDataStore(EphemeralIndependentDirectory.factory.type)
				.then(async (ephemDir) => ephemDir.trySetAlias(ephemDirId)),
		]);
	}

	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const focusTracker = getDataStoreEntryPoint<Signaler>(runtime, signalerId).then(
			(signaler) => new FocusTracker(container, audience, signaler),
		);

		const mouseTracker = getDataStoreEntryPoint<EphemeralIndependentDirectory>(
			runtime,
			ephemDirId,
		).then((ephemDir) => new MouseTracker(audience, ephemDir.directory));

		const audience = createServiceAudience({
			container,
			createServiceMember: createMockServiceMember,
		});

		return new TrackerAppModel(await focusTracker, await mouseTracker);
	}
}
