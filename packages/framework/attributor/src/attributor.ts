/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, IUser } from "@fluidframework/protocol-definitions";
import { UsageError } from "@fluidframework/container-utils";

export interface AttributionInfo {
	user: IUser;
	timestamp: number;
}

export interface IAttributor {
	getAttributionInfo(key: number): AttributionInfo;

	tryGetAttributionInfo(key: number): AttributionInfo | undefined;

	entries(): IterableIterator<[number, AttributionInfo]>;

	// TODO:
	// - GC
}

export class Attributor implements IAttributor {
	protected readonly keyToInfo: Map<number, AttributionInfo>;

	constructor(
		initialEntries?: Iterable<[number, AttributionInfo]>,
	) {
		this.keyToInfo = new Map(initialEntries ?? []);
	}

	public getAttributionInfo(key: number): AttributionInfo {
		const result = this.tryGetAttributionInfo(key);
		if (!result) {
			throw new UsageError(`Requested attribution information for unstored key: ${key}.`);
		}
		return result;
	}

	public tryGetAttributionInfo(key: number): AttributionInfo | undefined {
		return this.keyToInfo.get(key);
	}

	public entries(): IterableIterator<[number, AttributionInfo]> {
		return this.keyToInfo.entries();
	}
}

export class OpStreamAttributor extends Attributor implements IAttributor {
	constructor(
		runtime: IFluidDataStoreRuntime,
		initialEntries?: Iterable<[number, AttributionInfo]>,
	) {
		super(initialEntries);
		const { deltaManager } = runtime;
		deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			const client = runtime.getAudience().getMember(message.clientId);
			// TODO: This case may be legitimate, and if so we need to figure out how to handle it.
			assert(client !== undefined, "Received message from user not in the audience");
			this.keyToInfo.set(message.sequenceNumber, { user: client.user, timestamp: message.timestamp });
		});
	}
}