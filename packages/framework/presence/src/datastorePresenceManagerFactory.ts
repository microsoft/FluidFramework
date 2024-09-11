/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Hacky support for internal datastore based usages.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";
import type {
	AliasResult,
	IContainerRuntimeBase,
	NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import { BasicDataStoreFactory, LoadableFluidObject } from "./datastoreSupport.js";
import type { IPresence } from "./presence.js";
import { createPresenceManager } from "./presenceManager.js";

import type { IExtensionMessage } from "@fluid-experimental/presence/internal/container-definitions/internal";

function assertSignalMessageIsValid(
	message: IInboundSignalMessage | IExtensionMessage,
): asserts message is IExtensionMessage {
	assert(message.clientId !== null, 0xa58 /* Signal must have a client ID */);
	// The other difference between messages is that `content` for
	// IExtensionMessage is JsonDeserialized and we are fine assuming that.
}

/**
 * Simple FluidObject holding Presence Manager.
 */
class PresenceManagerDataObject extends LoadableFluidObject {
	// Creation of presence manager is deferred until first acquisition to avoid
	// instantiations and stand-up by Summarizer that has no actual use.
	private _presenceManager: IPresence | undefined;

	public presenceManager(): IPresence {
		if (!this._presenceManager) {
			// TODO: investigate if ContainerExtensionStore (path-based address routing for
			// Signals) is readily detectable here and use that presence manager directly.
			const manager = createPresenceManager(this.runtime);
			this.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				assertSignalMessageIsValid(message);
				manager.processSignal("", message, local);
			});
			this.runtime.getAudience().on("removeMember", (clientId: string) => {
				manager.removeClientConnectionId(clientId);
			});
			this._presenceManager = manager;
		}
		return this._presenceManager;
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
export function acquirePresenceViaDataObject(
	fluidLoadable: ExperimentalPresenceDO,
): IPresence {
	if (fluidLoadable instanceof PresenceManagerDataObject) {
		return fluidLoadable.presenceManager();
	}

	throw new Error("Incompatible loadable; make sure to use ExperimentalPresenceManager");
}

// #region Encapsulated model support

/**
 * Interface for {@link ExperimentalPresenceManager} that supports "legacy" loading patterns.
 *
 * @legacy
 * @alpha
 */
export interface ExperimentalLegacyPresenceManager {
	get registryEntry(): NamedFluidDataStoreRegistryEntry;
	initializingFirstTime(containerRuntime: IContainerRuntimeBase): Promise<AliasResult>;
	getPresence(containerRuntime: IContainerRuntime): Promise<IPresence>;
}

class LegacyPresenceManagerFactory extends PresenceManagerFactory implements ExperimentalLegacyPresenceManager{
	private readonly alias: string = "system:presence-manager";

	public get registryEntry(): NamedFluidDataStoreRegistryEntry {
		return [this.factory.type, Promise.resolve(this.factory)];
	}

	/**
	 * Creates exclusive data store for {@link IPresenceManager} to work in.
	 */
	public async initializingFirstTime(
		containerRuntime: IContainerRuntimeBase,
	): Promise<AliasResult> {
		return containerRuntime
			.createDataStore(this.factory.type)
			.then(async (datastore) => datastore.trySetAlias(this.alias));
	}

	/**
	 * Provides {@link IPresence} once factory has been registered and
	 * instantiation is complete.
	 */
	public async getPresence(containerRuntime: IContainerRuntime): Promise<IPresence> {
		const entryPointHandle = (await containerRuntime.getAliasedDataStoreEntryPoint(
			this.alias,
		)) as IFluidHandle<PresenceManagerDataObject> | undefined;

		if (entryPointHandle === undefined) {
			throw new Error(`dataStore [${this.alias}] must exist`);
		}

		const dataobj = await entryPointHandle.get();
		return dataobj.presenceManager();
	}
}

/**
 * Instance of {@link ExperimentalPresenceManager} that supports "legacy" loading patterns.
 *
 * @legacy
 * @alpha
 */
export const ExperimentalLegacyPresenceManager: ExperimentalLegacyPresenceManager = new LegacyPresenceManagerFactory();

// #endregion
