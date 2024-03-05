/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { type AttributionInfo } from "@fluidframework/runtime-definitions";

import { Attributor, type IAttributor } from "../attributor.js";
import {
	AttributorSerializer,
	chain,
	type Encoder,
	type SerializedAttributor,
} from "../encoders.js";
import { type InternedStringId } from "../stringInterner.js";

function makeNoopEncoder<T>(): Encoder<T, T> {
	return {
		encode: (x) => x,
		decode: (x) => x,
	};
}

describe("AttributorSerializer", () => {
	it("uses its timestamp encoder", () => {
		it("on encode", () => {
			const attributor = new Attributor([
				[1, { user: { id: "a" }, timestamp: 500 }],
				[2, { user: { id: "a" }, timestamp: 6001 }],
			]);
			const calls: unknown[] = [];
			const serializer = new AttributorSerializer((entries) => new Attributor(entries), {
				encode: (x): number[] => {
					calls.push(x);
					return x;
				},
				decode: (x): number[] => x,
			});
			assert.equal(calls.length, 0);
			serializer.encode(attributor);
			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0], [500, 6001]);
		});

		it("on decode", () => {
			const calls: unknown[] = [];
			const serializer = new AttributorSerializer((entries) => new Attributor(entries), {
				encode: (x): number[] => x,
				decode: (x): number[] => {
					calls.push(x);
					return x;
				},
			});
			const encoded: SerializedAttributor = {
				interner: ["a"],
				seqs: [1, 2],
				timestamps: [501, 604],
				attributionRefs: [0 as InternedStringId, 0 as InternedStringId],
			};

			assert.equal(calls.length, 0);
			serializer.decode(encoded);
			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0], [501, 604]);
		});
	});

	describe("correctly round-trips", () => {
		const testCases: { name: string; entries: Iterable<[number, AttributionInfo]> }[] = [
			{
				name: "empty attribution information",
				entries: [],
			},
			{
				name: "one attribution",
				entries: [[5, { user: { id: "only user" }, timestamp: 6000 }]],
			},
			{
				name: "multiple keys associated with the same user",
				entries: [
					[1, { user: { id: "user foo" }, timestamp: 500 }],
					[2, { user: { id: "user foo" }, timestamp: 7000 }],
				],
			},
			{
				name: "multiple keys associated with different users",
				entries: [
					[1, { user: { id: "user foo" }, timestamp: 500 }],
					[2, { user: { id: "user bar" }, timestamp: 7000 }],
				],
			},
		];

		for (const { name, entries } of testCases) {
			it(name, () => {
				const calls: unknown[] = [];
				let retVal: IAttributor | undefined;
				const serializer = new AttributorSerializer((providedEntries) => {
					calls.push(providedEntries);
					retVal = new Attributor(providedEntries);
					return retVal;
				}, makeNoopEncoder());
				const attributor = new Attributor(entries);
				const roundTrippedAttributor = serializer.decode(serializer.encode(attributor));
				assert.equal(calls.length, 1);
				assert.deepEqual(calls[0], entries);
				assert.equal(retVal, roundTrippedAttributor);
			});
		}
	});
});

describe("chain", () => {
	it("correctly chains encoders", () => {
		const encodeCalls: string[] = [];
		const decodeCalls: string[] = [];
		const makeLoggingChain = <T>(tag: string): Encoder<T, T> => ({
			encode: (s: T): T => {
				encodeCalls.push(tag);
				return s;
			},
			decode: (s: T): T => {
				decodeCalls.push(tag);
				return s;
			},
		});
		const encoder = chain(makeLoggingChain("A"), makeLoggingChain("B"));
		assert.deepEqual(encodeCalls, []);
		assert.deepEqual(decodeCalls, []);
		assert.equal(encoder.encode("foo"), "foo");
		assert.deepEqual(encodeCalls, ["A", "B"]);
		assert.deepEqual(decodeCalls, []);
		assert.equal(encoder.decode("bar"), "bar");
		assert.deepEqual(encodeCalls, ["A", "B"]);
		assert.deepEqual(decodeCalls, ["B", "A"]);
	});
});
