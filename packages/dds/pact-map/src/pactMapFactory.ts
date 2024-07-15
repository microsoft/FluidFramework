/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import type { IPactMap } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";
import { PactMapClass } from "./pactMap.js";

/**
 * The factory that produces the PactMap
 */
export class PactMapFactory implements IChannelFactory<IPactMap> {
	public static readonly Type = "https://graph.microsoft.com/types/pact-map";

	public static readonly Attributes: IChannelAttributes = {
		type: PactMapFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return PactMapFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return PactMapFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IPactMap> {
		const pactMap = new PactMapClass(id, runtime, attributes);
		await pactMap.load(services);
		return pactMap;
	}

	public create(document: IFluidDataStoreRuntime, id: string): IPactMap {
		const pactMap = new PactMapClass(id, document, this.attributes);
		pactMap.initializeLocal();
		return pactMap;
	}
}

/**
 * The PactMap distributed data structure provides key/value storage with a cautious conflict resolution strategy.
 * This strategy optimizes for all clients being aware of the change prior to considering the value as accepted.
 *
 * It is still experimental and under development.  Please do try it out, but expect breaking changes in the future.
 *
 * @remarks
 * ### Creation
 *
 * To create a `PactMap`, call the static create method:
 *
 * ```typescript
 * const pactMap = PactMap.create(this.runtime, id);
 * ```
 *
 * ### Usage
 *
 * Setting and reading values is somewhat similar to a `SharedMap`.  However, because the acceptance strategy
 * cannot be resolved until other clients have witnessed the set, the new value will only be reflected in the data
 * after the consensus is reached.
 *
 * ```typescript
 * pactMap.on("pending", (key: string) => {
 *     console.log(pactMap.getPending(key));
 * });
 * pactMap.on("accepted", (key: string) => {
 *     console.log(pactMap.get(key));
 * });
 * pactMap.set("myKey", "myValue");
 *
 * // Reading from the pact map prior to the async operation's completion will still return the old value.
 * console.log(pactMap.get("myKey"));
 * ```
 *
 * The acceptance process has two stages.  When an op indicating a client's attempt to set a value is sequenced,
 * we first verify that it was set with knowledge of the most recently accepted value (consensus-like FWW).  If it
 * meets this bar, then the value is "pending".  During this time, clients may observe the pending value and act
 * upon it, but should be aware that not all other clients may have witnessed the value yet.  Once all clients
 * that were connected at the time of the value being set have explicitly acknowledged the new value, the value
 * becomes "accepted".  Once the value is accepted, it once again becomes possible to set the value, again with
 * consensus-like FWW resolution.
 *
 * Since all connected clients must explicitly accept the new value, it is important that all connected clients
 * have the PactMap loaded, including e.g. the summarizing client.  Otherwise, those clients who have not loaded
 * the PactMap will not be responding to proposals and delay their acceptance (until they disconnect, which implicitly
 * removes them from consideration).  The easiest way to ensure all clients load the PactMap is to instantiate it
 * as part of instantiating the IRuntime for the container (containerHasInitialized if using Aqueduct).
 *
 * ### Eventing
 *
 * `PactMap` is an `EventEmitter`, and will emit events when a new value is accepted for a key.
 *
 * ```typescript
 * pactMap.on("accept", (key: string) => {
 *     console.log(`New value was accepted for key: ${ key }, value: ${ pactMap.get(key) }`);
 * });
 * ```
 * @internal
 */
export const PactMap = createSharedObjectKind(PactMapFactory);
