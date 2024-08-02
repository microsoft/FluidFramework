/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { type IUser } from "@fluidframework/driver-definitions";
import {
	type AttributionInfo,
	type CustomAttributionInfo,
} from "@fluidframework/runtime-definitions/internal";

import { type IAttributor } from "./attributor.js";
import { type InternedStringId, MutableStringInterner } from "./stringInterner.js";

export interface Encoder<TDecoded, TEncoded> {
	encode(decoded: TDecoded): TEncoded;
	decode(encoded: TEncoded): TDecoded;
}

// Note: the encoded format doesn't matter as long as it's serializable;
// these types could be weakened.
export type TimestampEncoder = Encoder<number[], number[]>;

export const deltaEncoder: TimestampEncoder = {
	encode: (timestamps: number[]) => {
		const deltaTimestamps: number[] = Array.from({ length: timestamps.length });
		let prev = 0;
		for (const [i, timestamp] of timestamps.entries()) {
			deltaTimestamps[i] = timestamp - prev;
			prev = timestamp;
		}

		return deltaTimestamps;
	},
	decode: (encoded: unknown) => {
		assert(
			Array.isArray(encoded),
			0x4b0 /* Encoded timestamps should be an array of numbers */,
		);
		const timestamps: number[] = Array.from({ length: encoded.length });
		let cumulativeSum = 0;
		for (let i = 0; i < encoded.length; i++) {
			cumulativeSum += encoded[i];
			timestamps[i] = cumulativeSum;
		}
		return timestamps;
	},
};

export type IAttributorSerializer = Encoder<IAttributor, SerializedAttributor>;

export interface SerializedAttributor {
	interner: readonly string[] /* result of calling getSerializable() on a StringInterner */;
	seqs: number[];
	timestamps: number[];
	attributionRefs: InternedStringId[];
	customAttributionInfo?: ICustomAttributorInfoForSerialization;
}

export interface ICustomAttributorInfoForSerialization {
	ids: string[];
	timestamps: number[];
	attributionRefs: InternedStringId[];
	attributionPropsRefs: InternedStringId[][];
	attributionValuesRefs: InternedStringId[][];
}

export class AttributorSerializer implements IAttributorSerializer {
	public constructor(
		private readonly makeAttributor: (
			entries: Iterable<[number, AttributionInfo]>,
			customAttributionEntries?: Iterable<[string, CustomAttributionInfo]>,
		) => IAttributor,
		private readonly timestampEncoder: TimestampEncoder,
	) {}

	/**
	 * {@inheritDoc Encoder.encode}
	 */
	public encode(attributor: IAttributor): SerializedAttributor {
		const interner = new MutableStringInterner();
		const seqs: number[] = [];
		const timestamps: number[] = [];
		const attributionRefs: InternedStringId[] = [];
		for (const [seq, { user, timestamp }] of attributor.entries()) {
			seqs.push(seq);
			timestamps.push(timestamp);
			const ref = interner.getOrCreateInternedId(JSON.stringify(user));
			attributionRefs.push(ref);
		}

		const ids: string[] = [];
		const customTimestamps: number[] = [];
		const customAttributionRefs: InternedStringId[] = [];
		const customAttributionPropsRefs: InternedStringId[][] = [];
		const customAttributionValuesRefs: InternedStringId[][] = [];
		for (const [
			id,
			{ user, timestamp, customAttributes },
		] of attributor.customAttributionEntries()) {
			ids.push(id);
			customTimestamps.push(timestamp);
			const ref = interner.getOrCreateInternedId(JSON.stringify(user));
			customAttributionRefs.push(ref);
			if (customAttributes === undefined) {
				customAttributionPropsRefs.push([]);
				customAttributionValuesRefs.push([]);
			} else {
				const attributionPropsRef: InternedStringId[] = [];
				const attributionValueRef: InternedStringId[] = [];
				for (const [key, value] of Object.entries(customAttributes)) {
					const val = typeof value === "number" ? value.toString() : value;
					const propRef = interner.getOrCreateInternedId(key);
					const valRef = interner.getOrCreateInternedId(val);
					attributionPropsRef.push(propRef);
					attributionValueRef.push(valRef);
				}
				customAttributionPropsRefs.push(attributionPropsRef);
				customAttributionValuesRefs.push(attributionValueRef);
			}
		}

		const serialized: SerializedAttributor = {
			interner: interner.getSerializable(),
			seqs,
			timestamps: this.timestampEncoder.encode(timestamps),
			attributionRefs,
		};

		if (ids.length > 0) {
			serialized.customAttributionInfo = {
				ids,
				timestamps: this.timestampEncoder.encode(customTimestamps),
				attributionRefs,
				attributionPropsRefs: customAttributionPropsRefs,
				attributionValuesRefs: customAttributionValuesRefs,
			};
		}
		return serialized;
	}

	/**
	 * {@inheritDoc Encoder.decode}
	 */
	public decode(encoded: SerializedAttributor): IAttributor {
		const interner = new MutableStringInterner(encoded.interner);
		const {
			seqs,
			timestamps: encodedTimestamps,
			attributionRefs,
			customAttributionInfo,
		} = encoded;
		const timestamps = this.timestampEncoder.decode(encodedTimestamps);
		assert(
			seqs.length === timestamps.length && timestamps.length === attributionRefs.length,
			0x4b1 /* serialized attribution columns should have the same length */,
		);
		const entries: [number, AttributionInfo][] = Array.from({ length: seqs.length });
		for (const [i, key] of seqs.entries()) {
			// Non null asserting, we asserted seqs, timestamps and attributionRefs have the same length above
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const timestamp = timestamps[i]!;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const ref = attributionRefs[i]!;
			const user = JSON.parse(interner.getString(ref)) as IUser;
			entries[i] = [key, { user, timestamp }];
		}

		if (customAttributionInfo !== undefined) {
			const {
				ids,
				timestamps: encodedTimestamps2,
				attributionRefs: attributionRefs2,
				attributionPropsRefs,
				attributionValuesRefs,
			} = customAttributionInfo;
			const timestamps2 = this.timestampEncoder.decode(encodedTimestamps2);
			assert(
				ids.length === timestamps2.length &&
					ids.length === attributionRefs2.length &&
					ids.length === attributionPropsRefs.length &&
					ids.length === attributionValuesRefs.length,
				"serialized cutom attribution columns should have the same length",
			);
			const entries2: [string, CustomAttributionInfo][] = Array.from({ length: ids.length });
			for (const [i, key] of ids.entries()) {
				// Non null asserting, we asserted ids, timestamps and attributionRefs have the same length above
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const timestamp = timestamps2[i]!;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const ref = attributionRefs2[i]!;
				const user = JSON.parse(interner.getString(ref)) as IUser;
				const attributionPropsRef = attributionPropsRefs[i];
				const attributionValueRef = attributionValuesRefs[i];
				if (attributionPropsRef !== undefined && attributionValueRef !== undefined) {
					const customAttributes = {};
					for (const [j, key1] of attributionPropsRef.entries()) {
						customAttributes[interner.getString(key1)] = interner.getString(
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							attributionValueRef[j]!,
						);
					}
					entries2[i] = [key, { user, timestamp, customAttributes }];
				}
			}
			return this.makeAttributor(entries, entries2);
		}
		return this.makeAttributor(entries);
	}
}

/**
 * Creates an encoder which composes `a` and `b`.
 */
export const chain = <T1, T2, T3>(
	a: Encoder<T1, T2>,
	b: Encoder<T2, T3>,
): Encoder<T1, T3> => ({
	encode: (content) => b.encode(a.encode(content)),
	decode: (content) => a.decode(b.decode(content)),
});
