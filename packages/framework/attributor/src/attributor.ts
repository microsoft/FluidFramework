/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import { IDocumentMessage, ISequencedDocumentMessage, IUser } from "@fluidframework/protocol-definitions";
import { UsageError } from "@fluidframework/container-utils";
import { IAudience, IDeltaManager } from "@fluidframework/container-definitions";

/**
 * Attribution information associated with a change.
 */
export interface AttributionInfo {
	/**
	 * The user that performed the change.
	 */
	user: IUser;
	/**
	 * When the change happened.
	 */
	timestamp: number;
}

/**
 * Can be indexed into the ContainerRuntime in order to retrieve {@link AttributionInfo}.
 * 
 * @remarks - These keys contain information about the type of attribution the information corresponds to, as
 * well as the key which should be used to index into that information.
 * 
 * For example, `{ type: "op", key: 205 }` is the AttributionKey which provides the user/timestamp information
 * for whoever actually performed the op with sequenceNumber 205.
 * If that op happened to be a copy-paste of content from an external document, the application might want to
 * preserve some information about who originally wrote that content (note: there are privacy considerations
 * in this realm).
 * The application could do so by injecting a second IAttributor into their runtime and transferring whatever
 * information they know to that attributor. Then, when later querying their content for any AttributionKeys,
 * they would discover both `{ type: "op", key: 205 }` and `{ type: "externalPaste", key: "<whatever key they used>" }`.
 */
export interface AttributionKey {
	/**
	 * The type of attribution that this key corresponds to.
	 * This aligns with the id/name of the attributor injected into the runtime that stores this key.
	 */
	type: string;

	/**
	 * The key associated with that attributor.
	 */
	key: number | string;
}

/**
 * Provides lookup between attribution keys and their associated attribution information.
 */
export interface IAttributor {
	/**
	 * Retrieves attribution information associated with a particular key.
	 * @param key - Attribution key to look up.
	 * @throws If no attribution information is recorded for that key.
	 */
	getAttributionInfo(key: number | string): AttributionInfo;

	/**
	 * @param key - Attribution key to look up.
	 * @returns the attribution information associated with the provided key, or undefined if no information exists.
	 */
	tryGetAttributionInfo(key: number | string): AttributionInfo | undefined;

	/**
	 * @returns an iterable of (attribution key, attribution info) pairs for each stored key.
	 */
	entries(): IterableIterator<[number | string, AttributionInfo]>;

	/**
	 * Runtime type information of the attributor. This is required for the runtime to reconstruct custom attributors
	 * from snapshots.
	 */
	readonly type: string;

	// TODO:
	// - GC
}

/**
 * {@inheritdoc IAttributor}
 */
export abstract class Attributor implements IAttributor {
	protected readonly keyToInfo: Map<number | string, AttributionInfo>;

	/**
	 * @param initialEntries - Any entries which should be populated on instantiation.
	 */
	constructor(
		initialEntries?: Iterable<[number | string, AttributionInfo]>,
	) {
		this.keyToInfo = new Map(initialEntries ?? []);
	}

	/**
	 * {@inheritdoc IAttributor.getAttributionInfo}
	 */
	public getAttributionInfo(key: number | string): AttributionInfo {
		const result = this.tryGetAttributionInfo(key);
		if (!result) {
			throw new UsageError(`Requested attribution information for unstored key: ${key}.`);
		}
		return result;
	}

	/**
	 * {@inheritdoc IAttributor.tryGetAttributionInfo}
	 */
	public tryGetAttributionInfo(key: number | string): AttributionInfo | undefined {
		return this.keyToInfo.get(key);
	}

	/**
	 * {@inheritdoc IAttributor.entries}
	 */
	public entries(): IterableIterator<[number | string, AttributionInfo]> {
		return this.keyToInfo.entries();
	}

	abstract get type(): string;
}

/**
 * Attributor which listens to an op stream and records entries for each op.
 * Sequence numbers are used as attribution keys.
 */
export class OpStreamAttributor extends Attributor implements IAttributor {
	constructor(
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		audience: IAudience,
		initialEntries?: Iterable<[number, AttributionInfo]>,
	) {
		super(initialEntries);
		deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			const client = audience.getMember(message.clientId);
			// TODO: This case may be legitimate, and if so we need to figure out how to handle it.
			assert(client !== undefined, 0x4af /* Received message from user not in the audience */);
			this.keyToInfo.set(message.sequenceNumber, { user: client.user, timestamp: message.timestamp });
		});
	}

	public get type(): string { return "op"; }
}