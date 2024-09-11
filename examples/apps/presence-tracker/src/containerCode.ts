/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import { Signaler, ISignaler } from "@fluid-experimental/data-objects";
// eslint-disable-next-line import/no-internal-modules
import { ExperimentalLegacyPresenceManager } from "@fluid-experimental/presence/legacy";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { createServiceAudience } from "@fluidframework/fluid-static/internal";

import { createMockServiceMember } from "./Audience.js";
import { FocusTracker } from "./FocusTracker.js";
import { MouseTracker } from "./MouseTracker.js";
import { PointerTracker } from "./PointerTracker.js";

export interface ITrackerAppModel {
	readonly focusTracker: FocusTracker;
	readonly mouseTracker: MouseTracker;
	readonly pointerTracker: PointerTracker;
}

class TrackerAppModel implements ITrackerAppModel {
	public constructor(
		public readonly focusTracker: FocusTracker,
		public readonly mouseTracker: MouseTracker,
		public readonly pointerTracker: PointerTracker,
	) {}
}

const signalerId = "signaler";

export class TrackerContainerRuntimeFactory extends ModelContainerRuntimeFactory<ITrackerAppModel> {
	constructor() {
		super(
			new Map([
				// registryEntries
				Signaler.factory.registryEntry,
				ExperimentalLegacyPresenceManager.registryEntry,
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
			ExperimentalLegacyPresenceManager.initializingFirstTime(runtime),
		]);
	}

	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const focusTracker = getDataStoreEntryPoint<ISignaler>(runtime, signalerId).then(
			(signaler) => new FocusTracker(container, audience, signaler),
		);

		const mouseAndPointerTrackers = ExperimentalLegacyPresenceManager.getPresence(
			runtime,
		).then((presence) => {
			const states = presence.getStates("name:trackers", {});
			return {
				mouseTracker: new MouseTracker(presence, states, audience),
				pointerTracker: new PointerTracker(presence, states, audience),
			};
		});

		const audience = createServiceAudience({
			container,
			createServiceMember: createMockServiceMember,
		});

		return new TrackerAppModel(
			await focusTracker,
			(await mouseAndPointerTrackers).mouseTracker,
			(await mouseAndPointerTrackers).pointerTracker,
		);
	}
}
