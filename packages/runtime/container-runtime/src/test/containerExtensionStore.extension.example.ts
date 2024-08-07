/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//
// Example of a container extension.
//

import type {
	ContainerExtensionStore,
	IContainerExtension,
	IExtensionMessage,
	IExtensionRuntime,
} from "@fluidframework/container-definitions/internal";

/**
 * Unique address within a session.
 *
 * @remarks
 * A string known to all clients working with a certain IndependentMap and unique
 * among IndependentMaps. Recommend using specifying concatenation of: type of
 * unique identifier, `:` (required), and unique identifier.
 *
 * @example Examples
 * ```typescript
 *   "guid:g0fl001d-1415-5000-c00l-g0fa54g0b1g1"
 *   "address:object0/sub-object2:pointers"
 * ```
 */
type IndependentMapAddress = `${string}:${string}`;

declare class IndependentMap<TSchema> {
	public constructor(address: IndependentMapAddress, schema: TSchema);
	public ensureContent(content: TSchema): void;
}

interface IIndependentStateManager {
	/**
	 * Acquires an Independent Map from store or adds new one.
	 *
	 * @param mapAddress - Address of the requested Independent Map
	 * @param factory - Factory to create the Independent Map if not found
	 * @returns The Independent Map
	 */
	acquireIndependentMap<TSchema>(
		mapAddress: IndependentMapAddress,
		requestedContent: TSchema,
	): IndependentMap<TSchema>;
}

class IndependentStateManager implements IContainerExtension<never> {
	public readonly extension: IIndependentStateManager = this;
	public readonly interface = this;

	constructor(/* private readonly */ runtime: IExtensionRuntime) {}

	onNewContext(): void {
		// No-op
	}

	static readonly extensionId = "dis:bb89f4c0-80fd-4f0c-8469-4f2848ee7f4a";
	private readonly maps = new Map<string, IndependentMap<unknown>>();

	/**
	 * Acquires an Independent Map from store or adds new one.
	 *
	 * @param mapAddress - Address of the requested Independent Map
	 * @param factory - Factory to create the Independent Map if not found
	 * @returns The Independent Map
	 */
	public acquireIndependentMap<TSchema>(
		mapAddress: IndependentMapAddress,
		requestedContent: TSchema,
	): IndependentMap<TSchema> {
		let entry = this.maps.get(mapAddress);
		if (entry) {
			entry.ensureContent(requestedContent);
		} else {
			entry = new IndependentMap(mapAddress, requestedContent);
			this.maps.set(mapAddress, entry);
		}
		return entry as IndependentMap<TSchema>;
	}

	/**
	 * Check for Independent State message and process it.
	 *
	 * @param address - Address of the message
	 * @param message - Message to be processed
	 * @param local - Whether the message originated locally (`true`) or remotely (`false`)
	 */
	public processSignal(address: string, message: IExtensionMessage, local: boolean): void {
		// Direct to the appropriate Independent Map, if present.
		const map = this.maps.get(address);
		if (!map) {
			return;
		}
	}
}

/**
 * Demostrates how external package (internal) can hook up extension to extension store (container runtime).
 */
export function hookItUp(extensionStore: ContainerExtensionStore): void {
	const ism = extensionStore.acquireExtension(
		IndependentStateManager.extensionId,
		IndependentStateManager,
	);
	ism.acquireIndependentMap("address:object0/sub-object2:pointers", {});
}
