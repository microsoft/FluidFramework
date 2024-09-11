/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Hacky support for internal datastore based usages.
 */

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import { BasicDataStoreFactory, LoadableFluidObject } from "./datastoreSupport.js";
import type { IPresence } from "./presence.js";
import { createPresenceManager } from "./presenceManager.js";

/**
 * Simple FluidObject holding Presence Manager.
 */
class PresenceManagerDataObject extends LoadableFluidObject {
	public readonly psm: IPresence;

	public constructor(runtime: FluidDataStoreRuntime) {
		super(runtime);
		// TODO: investigate if ContainerExtensionStore (path-based address routing for
		// Signals) is readily detectable here and use that presence manager directly.
		this.psm = createPresenceManager(runtime);
	}
}

/**
 * Factory class to create {@link IPresence} in own data store.
 */
class PresenceManagerFactory {
	public is(value: IFluidLoadable | ExperimentalPresenceDO): value is ExperimentalPresenceDO {
		return value instanceof PresenceManagerDataObject;
	}

	public readonly factory = new BasicDataStoreFactory(
		"@fluid-experimental/presence",
		PresenceManagerDataObject,
	);
}

/**
 * Brand for Experimental Presence Data Object.
 *
 * @remarks
 * See {@link acquirePresenceViaDataObject} for example usage.
 *
 * @sealed
 * @alpha
 */
export declare class ExperimentalPresenceDO {
	private readonly _self: ExperimentalPresenceDO;
}

/**
 * DataStore based Presence Manager that is used as fallback for preferred Container
 * Extension based version requires registration. Export SharedObjectKind for registration.
 *
 * @alpha
 */
export const ExperimentalPresenceManager =
	new PresenceManagerFactory() as unknown as SharedObjectKind<
		IFluidLoadable & ExperimentalPresenceDO
	>;

/**
 * Acquire IPresence from a DataStore based Presence Manager
 *
 * @example
 * ```typescript
 * const containerSchema = {
 * 	initialObjects: {
 * 		experimentalPresence: ExperimentalPresenceDO,
 * 	},
 * } satisfies ContainerSchema;
 * ```
 * then
 * ```typescript
 * const presence = acquirePresenceViaDataObject(
 * 	container.initialObjects.experimentalPresence,
 * 	);
 * ```
 *
 * @alpha
 */
export async function acquirePresenceViaDataObject(
	fluidLoadable: ExperimentalPresenceDO,
): Promise<IPresence> {
	if (fluidLoadable instanceof PresenceManagerDataObject) {
		return fluidLoadable.psm;
	}

	throw new Error("Incompatible loadable; make sure to use ExperimentalPresenceManager");
}
