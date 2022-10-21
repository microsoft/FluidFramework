/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { gzip, ungzip } from "pako";
import { assert, bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { IFluidDataStoreRuntime, Jsonable } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, IUser } from "@fluidframework/protocol-definitions";
import { UsageError } from "@fluidframework/container-utils";
import { InternedStringId, MutableStringInterner } from "./stringInterner";

export interface Encoder<TDecoded, TEncoded> {
	encode(decoded: TDecoded): TEncoded;

	decode(encoded: TEncoded): TDecoded;
}

// TODO: Usage of Jsonable here isn't typesafe.
export type SummaryEncoder = Encoder<SerializedAttributor, string>;

export type TimestampEncoder = Encoder<number[], Jsonable>;

export interface AttributionInfo {
	user: IUser;
	timestamp: number;
}

export interface IAttributor {
	getAttributionInfo(seq: number): AttributionInfo;

	serialize(): string;
}

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
		} = { summary: gzipEncoder, timestamps: deltaEncoder },
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
			throw new UsageError("Requested attribution information for a seq not stored.");
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

export const gzipEncoder: SummaryEncoder = {
	encode: (summary: Jsonable) => {
		const unzipped = new TextEncoder().encode(JSON.stringify(summary));
		const zipped = gzip(unzipped);
		return bufferToString(zipped, "base64");
	},
	decode: (serializedSummary: string) => {
		const zipped = new Uint8Array(stringToBuffer(serializedSummary, "base64"));
		const unzipped = ungzip(zipped);
		const attributor: SerializedAttributor = JSON.parse(new TextDecoder().decode(unzipped));
		return attributor;
	},
};

export const deltaEncoder: TimestampEncoder = {
	encode: (timestamps: number[]) => {
		const deltaTimestamps: number[] = new Array(timestamps.length);
		let prev = 0;
		for (let i = 0; i < timestamps.length; i++) {
			deltaTimestamps[i] = timestamps[i] - prev;
			prev = timestamps[i];
		}
		return deltaTimestamps;
	},
	decode: (encoded: Jsonable) => {
		assert(Array.isArray(encoded), "Encoded timestamps should be an array of nummbers");
		const timestamps: number[] = new Array(encoded.length);
		let cumulativeSum = 0;
		for (let i = 0; i < encoded.length; i++) {
			cumulativeSum += encoded[i];
			timestamps[i] = cumulativeSum;
		}
		return timestamps;
	},
};
