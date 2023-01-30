/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AttributionInfo, Attributor, IAttributor } from "../attributor";
import { AttributorSerializer, chain, Encoder, SerializedAttributor } from "../encoders";

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
			const calls: any[] = [];
			const serializer = new AttributorSerializer((entries) => new Attributor(entries), {
				encode: (x) => {
					calls.push(x);
					return x;
				},
				decode: (x) => x,
			});
			assert.equal(calls.length, 0);
			serializer.encode(attributor);
			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0], [500, 6001]);
		});

		it("on decode", () => {
			const calls: any[] = [];
			const serializer = new AttributorSerializer((entries) => new Attributor(entries), {
				encode: (x) => x,
				decode: (x) => {
					calls.push(x);
					return x;
				},
			});
			const encoded: SerializedAttributor = {
				interner: ["a"],
				seqs: [1, 2],
				timestamps: [501, 604],
				attributionRefs: [0, 0] as any[],
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
				const calls: any[] = [];
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
		const makeLoggingChain = <T>(tag: string) => ({
			encode: (s: T) => {
				encodeCalls.push(tag);
				return s;
			},
			decode: (s: T) => {
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
