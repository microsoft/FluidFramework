/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IndependentMap as IndependentMapFacade,
	IndependentMapAddress,
	IndependentMapFactory as IndependentMapFactoryFacade,
	IRuntimeInternal,
} from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";

/**
 * @internal
 */
export interface IndependentMapEntry<TSchema, T> {
	readonly map: T;
	processSignal(signal: IInboundSignalMessage, local: boolean): void;
	ensureContent(content: TSchema): void;
}

/**
 * @internal
 */
export type IndependentMapFactory<TSchema, T> = new (
	containerRuntime: IContainerRuntime & IRuntimeInternal,
	signalAddress: IndependentMapAddress,
	initialContent: TSchema,
) => IndependentMapEntry<TSchema, T>;

export class IndependentStateManager {
	private readonly address = "dis:bb89f4c0-80fd-4f0c-8469-4f2848ee7f4a:";
	private readonly maps = new Map<string, IndependentMapEntry<unknown, unknown>>();

	/**
	 * Acquires an Independent Map from store or adds new one.
	 *
	 * @param mapAddress - Address of the requested Independent Map
	 * @param factory - Factory to create the Independent Map if not found
	 * @returns The Independent Map
	 */
	public acquireIndependentMap<
		T extends IndependentMapFacade<unknown>,
		TSchema = T extends IndependentMapFacade<infer _TSchema> ? _TSchema : never,
	>(
		containerRuntime: IContainerRuntime & IRuntimeInternal,
		mapAddress: IndependentMapAddress,
		requestedContent: TSchema,
		factoryFacade: IndependentMapFactoryFacade<T>,
	): T {
		const factory = factoryFacade as unknown as IndependentMapFactory<TSchema, T>;
		let entry = this.maps.get(mapAddress);
		if (entry) {
			assert(entry instanceof factory, "Existing IndependentMap is not of the expected type");
			entry.ensureContent(requestedContent);
		} else {
			entry = new factory(containerRuntime, `${this.address}${mapAddress}`, requestedContent);
			this.maps.set(mapAddress, entry);
		}
		return entry.map as T;
	}

	/**
	 * Check for Independent State signal and process it.
	 *
	 * @param address - Address of the signal (which may not be for ISM)
	 * @param signal - Signal to be processed
	 * @param local - Whether the signal originated locally or remotely
	 *
	 * @returns True if the signal was processed, false otherwise
	 */
	public processSignal(
		address: string,
		signal: IInboundSignalMessage,
		local: boolean,
	): boolean {
		if (!address.startsWith(this.address)) {
			return false;
		}

		const subaddress = address.substring(this.address.length);
		// Direct to the appropriate Independent Map, if present.
		this.maps.get(subaddress)?.processSignal(signal, local);
		return true;
	}
}
