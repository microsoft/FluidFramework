/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, IUser } from "@fluidframework/protocol-definitions";
import { UsageError } from "@fluidframework/container-utils";
import { InternedStringId, MutableStringInterner } from "./stringInterner";
import { deltaEncoder, Encoder, makeGzipEncoder, TimestampEncoder } from "./encoders";

export interface AttributionInfo {
	user: IUser;
	timestamp: number;
}

export interface IAttributor {
	getAttributionInfo(key: number): AttributionInfo;

	serialize(): string;
}

export type SummaryEncoder = Encoder<SerializedAttributor, string>;

/**
 * @internal
 */
export interface SerializedAttributor {
	interner: readonly string[]; /* result of calling getSerializable() on a StringInterner */
	keys: number[];
	timestamps: number[];
	attributionRefs: InternedStringId[];
}

export class Attributor implements IAttributor {
	private readonly keyToInfo: Map<number, AttributionInfo> = new Map();

	constructor(
		runtime: IFluidDataStoreRuntime,
		serialized?: string,
		private readonly encoders: {
			summary: SummaryEncoder;
			timestamps: TimestampEncoder;
		} = { summary: makeGzipEncoder(), timestamps: deltaEncoder },
	) {
		if (serialized !== undefined) {
			const serializedAttributor: SerializedAttributor = this.encoders.summary.decode(serialized);
			const interner = new MutableStringInterner(serializedAttributor.interner);
			const { keys, timestamps: encodedTimestamps, attributionRefs } = serializedAttributor;
			const timestamps = this.encoders.timestamps.decode(encodedTimestamps);
			assert(keys.length === timestamps.length && timestamps.length === attributionRefs.length,
				"serialized attribution columns should have the same length");
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				const timestamp = timestamps[i];
				const ref = attributionRefs[i];
				const user: IUser = JSON.parse(interner.getString(ref));
				this.keyToInfo.set(key, { user, timestamp });
			}
		}

		const { deltaManager } = runtime;
		deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			const client = runtime.getAudience().getMember(message.clientId);
			// TODO: This case may be legitimate, and if so we need to figure out how to handle it.
			assert(client !== undefined, "Received message from user not in the audience");
			this.keyToInfo.set(message.sequenceNumber, { user: client.user, timestamp: message.timestamp });
		});
	}

	public getAttributionInfo(key: number): AttributionInfo {
		const result = this.keyToInfo.get(key);
		// TODO: This error handling is awkward; this message doesn't make it clear what went wrong.
		if (!result) {
			throw new UsageError(`Requested attribution information for unstored key: ${key}.`);
		}
		return result;
	}

	public serialize(): string {
		const interner = new MutableStringInterner();
		const keys: number[] = [];
		const timestamps: number[] = [];
		const attributionRefs: InternedStringId[] = [];
		for (const [key, { user, timestamp }] of this.keyToInfo.entries()) {
			keys.push(key);
			timestamps.push(timestamp);
			const ref = interner.getOrCreateInternedId(JSON.stringify(user));
			attributionRefs.push(ref);
		}

		const serialized: SerializedAttributor = {
			interner: interner.getSerializable(),
			keys,
			timestamps: this.encoders.timestamps.encode(timestamps),
			attributionRefs,
		};

		return this.encoders.summary.encode(serialized);
	}

	// Unpictured:
	// - GC (there are several ways to hook this up, though one can check the data structure should support it in O(n))
}
