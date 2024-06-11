/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IDeltaManager } from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { type IQuorumClients } from "@fluidframework/driver-definitions";
import {
	MessageType,
	type IDocumentMessage,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { type AttributionInfo } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
 */
export class OpStreamAttributor extends Attributor implements IAttributor {
	public constructor(
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		quorumClients: IQuorumClients,
		initialEntries?: Iterable<[number, AttributionInfo]>,
	) {
		super(initialEntries);
		deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			if (message.type === MessageType.Operation) {
				assert(
					typeof message.clientId === "string",
					0x966 /* Client id should be present and should be of type string */,
				);
				const client = quorumClients.getMember(message.clientId);
				assert(
					client !== undefined,
					0x967 /* Received message from user not in the quorumClients */,
				);
				this.keyToInfo.set(message.sequenceNumber, {
					user: client.client.user,
					timestamp: message.timestamp,
				});
			}
		});
	}
}
