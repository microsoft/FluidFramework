/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Hacky support for internal datastore based usages.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type {
	ExtensionRuntimeEvents,
	RawInboundExtensionMessage,
} from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import { BasicDataStoreFactory, LoadableFluidObject } from "./datastoreSupport.js";
import type { Presence } from "./presence.js";
import { createPresenceManager } from "./presenceManager.js";
import type {
	OutboundClientJoinMessage,
	OutboundDatastoreUpdateMessage,
	SignalMessages,
} from "./protocol.js";

/**
 * This provides faux validation of the signal message.
 */
function assertSignalMessageIsValid(
	message: IInboundSignalMessage | RawInboundExtensionMessage<SignalMessages>,
): asserts message is RawInboundExtensionMessage<SignalMessages> {
	assert(message.clientId !== null, 0xa58 /* Signal must have a client ID */);
	// The other difference between messages is that `content` for
	// RawInboundExtensionMessage is JsonDeserialized and we are fine assuming that.
}

/**
 * Simple FluidObject holding Presence Manager.
 */
class PresenceManagerDataObject extends LoadableFluidObject {
	// Creation of presence manager is deferred until first acquisition to avoid
	// instantiations and stand-up by Summarizer that has no actual use.
	private _presenceManager: Presence | undefined;

	public presenceManager(): Presence {
		if (!this._presenceManager) {
			// TODO: investigate if ContainerExtensionStore (path-based address routing for
			// Signals) is readily detectable here and use that presence manager directly.
			const runtime = this.runtime;
			const events = createEmitter<ExtensionRuntimeEvents>();
			runtime.on("connected", (clientId) => events.emit("connected", clientId));
			runtime.on("disconnected", () => events.emit("disconnected"));

			const manager = createPresenceManager({
				isConnected: () => runtime.connected,
				getClientId: () => runtime.clientId,
				events,
				getQuorum: runtime.getQuorum.bind(runtime),
				getAudience: runtime.getAudience.bind(runtime),
				submitSignal: (message: OutboundClientJoinMessage | OutboundDatastoreUpdateMessage) =>
					runtime.submitSignal(message.type, message.content, message.targetClientId),
			});
			this.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				assertSignalMessageIsValid(message);
				manager.processSignal("", message, local);
			});
			this._presenceManager = manager;
		}
		return this._presenceManager;
	}
}

/**
 * Factory class to create {@link Presence} in own data store.
 */
class PresenceManagerFactory {
	public is(value: IFluidLoadable | ExperimentalPresenceDO): value is ExperimentalPresenceDO {
		return value instanceof PresenceManagerDataObject;
	}

	public readonly factory = new BasicDataStoreFactory(
		"@fluidframework/presence",
		PresenceManagerDataObject,
	);
}

/**
 * Brand for Experimental Presence Data Object.
 *
 * @remarks
 * See {@link getPresenceViaDataObject} for example usage.
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
 * Acquire Presence from a DataStore based Presence Manager
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
 * const presence = getPresenceViaDataObject(
 * 	container.initialObjects.experimentalPresence,
 * 	);
 * ```
 *
 * @alpha
 */
export function getPresenceViaDataObject(fluidLoadable: ExperimentalPresenceDO): Presence {
	if (fluidLoadable instanceof PresenceManagerDataObject) {
		return fluidLoadable.presenceManager();
	}

	throw new Error("Incompatible loadable; make sure to use ExperimentalPresenceManager");
}
