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
	getAttributionInfo(seq: number): AttributionInfo;

	serialize(): string;
}

export type SummaryEncoder = Encoder<SerializedAttributor, string>;

/**
 * @internal
 */
export interface SerializedAttributor {
	interner: readonly string[]; /* result of calling getSerializable() on a StringInterner */
	seqs: number[];
	timestamps: number[];
	attributionRefs: InternedStringId[];
}

export class Attributor implements IAttributor {
	private readonly seqToInfo: Map<number, AttributionInfo> = new Map();

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
			const { seqs, timestamps: encodedTimestamps, attributionRefs } = serializedAttributor;
			const timestamps = this.encoders.timestamps.decode(encodedTimestamps);
			assert(seqs.length === timestamps.length && timestamps.length === attributionRefs.length,
				"serialized attribution columns should have the same length");
			for (let i = 0; i < seqs.length; i++) {
				const seq = seqs[i];
				const timestamp = timestamps[i];
				const ref = attributionRefs[i];
				const user: IUser = JSON.parse(interner.getString(ref));
				this.seqToInfo.set(seq, { user, timestamp });
			}
		}

		const { deltaManager } = runtime;
		deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			const client = runtime.getAudience().getMember(message.clientId);
			// TODO: This case may be legitimate, and if so we need to figure out how to handle it.
			assert(client !== undefined, "Received message from user not in the audience");
			this.seqToInfo.set(message.sequenceNumber, { user: client.user, timestamp: message.timestamp });
		});
	}

	public getAttributionInfo(seq: number): AttributionInfo {
		const result = this.seqToInfo.get(seq);
		// TODO: This error handling is awkward; this message doesn't make it clear what went wrong.
		if (!result) {
			throw new UsageError(`No attribution info associated with key ${seq}.`);
		}
		return result;
	}

	public serialize(): string {
		const interner = new MutableStringInterner();
		const seqs: number[] = [];
		const timestamps: number[] = [];
		const attributionRefs: InternedStringId[] = [];
		for (const [seq, { user, timestamp }] of this.seqToInfo.entries()) {
			seqs.push(seq);
			timestamps.push(timestamp);
			const ref = interner.getOrCreateInternedId(JSON.stringify(user));
			attributionRefs.push(ref);
		}

		const serialized: SerializedAttributor = {
			interner: interner.getSerializable(),
			seqs,
			timestamps: this.encoders.timestamps.encode(timestamps),
			attributionRefs,
		};

		return this.encoders.summary.encode(serialized);
	}

	// Unpictured:
	// - GC (there are several ways to hook this up, though one can check the data structure should support it in O(n))
}
