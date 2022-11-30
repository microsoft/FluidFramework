/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { IUser } from "@fluidframework/protocol-definitions";
import { IAttributor, AttributionInfo } from "./attributor";
import { InternedStringId, MutableStringInterner } from "./stringInterner";

export interface Encoder<TDecoded, TEncoded> {
	encode(decoded: TDecoded): TEncoded;

	decode(encoded: TEncoded): TDecoded;
}

// Note: the encoded format doesn't matter as long as it's serializable;
// these types could be weakened.
export type TimestampEncoder = Encoder<number[], number[]>;

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

export type IAttributorSerializer = Encoder<IAttributor, SerializedAttributor>;

/**
 * @internal
 */
export interface SerializedAttributor {
	interner: readonly string[]; /* result of calling getSerializable() on a StringInterner */
	keys: number[];
	timestamps: number[];
	attributionRefs: InternedStringId[];
}

export class AttributorSerializer implements IAttributorSerializer {
	constructor(
		private readonly makeAttributor: (entries: Iterable<[number, AttributionInfo]>) => IAttributor,
		private readonly timestampEncoder: TimestampEncoder,
	) { }

	public encode(attributor: IAttributor): SerializedAttributor {
		const interner = new MutableStringInterner();
		const keys: number[] = [];
		const timestamps: number[] = [];
		const attributionRefs: InternedStringId[] = [];
		for (const [key, { user, timestamp }] of attributor.entries()) {
			keys.push(key);
			timestamps.push(timestamp);
			const ref = interner.getOrCreateInternedId(JSON.stringify(user));
			attributionRefs.push(ref);
		}

		const serialized: SerializedAttributor = {
			interner: interner.getSerializable(),
			keys,
			timestamps: this.timestampEncoder.encode(timestamps),
			attributionRefs,
		};

		return serialized;
	}

	public decode(encoded: SerializedAttributor): IAttributor {
		const interner = new MutableStringInterner(encoded.interner);
		const { keys, timestamps: encodedTimestamps, attributionRefs } = encoded;
		const timestamps = this.timestampEncoder.decode(encodedTimestamps);
		assert(keys.length === timestamps.length && timestamps.length === attributionRefs.length,
			"serialized attribution columns should have the same length");
		const entries = new Array(keys.length);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const timestamp = timestamps[i];
			const ref = attributionRefs[i];
			const user: IUser = JSON.parse(interner.getString(ref));
			entries[i] = [key, { user, timestamp }];
		}
		return this.makeAttributor(entries);
	}
}

/**
 * @returns an encoder which composes `a` and `b`.
 */
export const chain = <T1, T2, T3>(a: Encoder<T1, T2>, b: Encoder<T2, T3>): Encoder<T1, T3> => ({
	encode: (content) => b.encode(a.encode(content)),
	decode: (content) => a.decode(b.decode(content))
});
