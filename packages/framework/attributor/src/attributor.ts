/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	type IDocumentMessage,
	type ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { type AttributionInfo } from "@fluidframework/runtime-definitions";
import { UsageError } from "@fluidframework/telemetry-utils";
import { type IAudience, type IDeltaManager } from "@fluidframework/container-definitions";

/**
 * Provides lookup between attribution keys and their associated attribution information.
 * @internal
 */
export interface IAttributor {
	/**
	 * Retrieves attribution information associated with a particular key.
	 * @param key - Attribution key to look up.
	 * @throws If no attribution information is recorded for that key.
	 */
	getAttributionInfo(key: number): AttributionInfo;

	/**
	 * @param key - Attribution key to look up.
	 * @returns the attribution information associated with the provided key, or undefined if no information exists.
	 */
	tryGetAttributionInfo(key: number): AttributionInfo | undefined;

	/**
	 * @returns an iterable of (attribution key, attribution info) pairs for each stored key.
	 */
	entries(): IterableIterator<[number, AttributionInfo]>;

	// TODO:
	// - GC
}

/**
 * {@inheritdoc IAttributor}
 * @internal
 */
export class Attributor implements IAttributor {
	protected readonly keyToInfo: Map<number, AttributionInfo>;

	/**
	 * @param initialEntries - Any entries which should be populated on instantiation.
	 */
	public constructor(initialEntries?: Iterable<[number, AttributionInfo]>) {
		this.keyToInfo = new Map(initialEntries ?? []);
	}

	/**
	 * {@inheritdoc IAttributor.getAttributionInfo}
	 */
	public getAttributionInfo(key: number): AttributionInfo {
		const result = this.tryGetAttributionInfo(key);
		if (!result) {
			throw new UsageError(`Requested attribution information for unstored key: ${key}.`);
		}
		return result;
	}

	/**
	 * {@inheritdoc IAttributor.tryGetAttributionInfo}
	 */
	public tryGetAttributionInfo(key: number): AttributionInfo | undefined {
		return this.keyToInfo.get(key);
	}

	/**
	 * {@inheritdoc IAttributor.entries}
	 */
	public entries(): IterableIterator<[number, AttributionInfo]> {
		return this.keyToInfo.entries();
	}
}

/**
 * Attributor which listens to an op stream and records entries for each op.
 * Sequence numbers are used as attribution keys.
 * @internal
 */
export class OpStreamAttributor extends Attributor implements IAttributor {
	public constructor(
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		audience: IAudience,
		initialEntries?: Iterable<[number, AttributionInfo]>,
	) {
		super(initialEntries);
		deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			// TODO: Verify whether this should be able to handle server-generated ops (with null clientId)
			const client = audience.getMember(message.clientId as string);
			if (message.type === "op") {
				// TODO: This case may be legitimate, and if so we need to figure out how to handle it.
				assert(
					client !== undefined,
					0x4af /* Received message from user not in the audience */,
				);
				this.keyToInfo.set(message.sequenceNumber, {
					user: client.user,
					timestamp: message.timestamp,
				});
			}
		});
	}
}
