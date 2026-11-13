/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { dataStoreRegistryFromIterable } from "../dataStoreKind.js";
import { makeStubDataStoreKind } from "../stubSharedObject.js";

describe("dataStoreRegistryFromIterable", () => {
	it("looks up eager kinds from a single-use iterable", async () => {
		const first = makeStubDataStoreKind("first");
		const second = makeStubDataStoreKind("second");
		const registry = dataStoreRegistryFromIterable([first, second].values());

		assert.equal(await registry(first.type), first);
		assert.equal(await registry(second.type), second);
		assert.equal(await registry(first.type), first);
	});

	it("recognizes eager kinds even when they have a kind property", async () => {
		const kind = Object.assign(makeStubDataStoreKind("eager"), {
			kind: async () => {
				assert.fail("An eager kind must not be treated as a lazy loader");
			},
		});
		const registry = dataStoreRegistryFromIterable([kind]);

		assert.equal(await registry(kind.type), kind);
	});

	it("loads entries independently on demand and memoizes concurrent and later lookups", async () => {
		const first = makeStubDataStoreKind("first");
		const second = makeStubDataStoreKind("second");
		const calls: string[] = [];
		const registry = dataStoreRegistryFromIterable(
			[first, second].map((kind) => ({
				type: kind.type,
				kind: async () => {
					calls.push(kind.type);
					return kind;
				},
			})),
		);

		assert.deepEqual(calls, []);
		const results = await Promise.all([registry(first.type), registry(first.type)]);
		assert.equal(results[0], first);
		assert.equal(results[1], first);
		assert.equal(await registry(first.type), first);
		assert.deepEqual(calls, [first.type]);
		assert.equal(await registry(second.type), second);
		assert.equal(await registry(second.type), second);
		assert.deepEqual(calls, [first.type, second.type]);
	});

	for (const synchronous of [false, true]) {
		it(`caches ${synchronous ? "synchronous throws" : "rejected promises"} from a loader`, async () => {
			const error = new Error("Cannot load kind");
			let calls = 0;
			const registry = dataStoreRegistryFromIterable([
				{
					type: "failing",
					// eslint-disable-next-line @typescript-eslint/promise-function-async -- Tests synchronous throws before a promise is returned.
					kind: () => {
						calls++;
						if (synchronous) {
							throw error;
						}
						return Promise.reject(error);
					},
				},
			]);

			await Promise.all([
				assert.rejects(registry("failing"), (actual) => actual === error),
				assert.rejects(registry("failing"), (actual) => actual === error),
			]);
			await assert.rejects(registry("failing"), (actual) => actual === error);
			assert.equal(calls, 1);
		});
	}

	it("rejects duplicate eager and lazy type identifiers without loading them", () => {
		const kind = makeStubDataStoreKind("duplicate");
		const lazy = {
			type: kind.type,
			kind: async () => {
				assert.fail("Duplicate validation must not load a kind");
			},
		};
		for (const entries of [
			[kind, kind],
			[kind, lazy],
			[lazy, kind],
			[lazy, lazy],
		]) {
			assert.throws(
				() => dataStoreRegistryFromIterable(entries),
				/Duplicate data store type: duplicate/,
			);
		}
	});

	it("rejects unknown types without loading unrelated entries", async () => {
		const registry = dataStoreRegistryFromIterable([
			{
				type: "known",
				kind: async () => {
					assert.fail("Unknown lookups must not load another entry");
				},
			},
		]);
		await assert.rejects(registry("unknown"), /Unknown data store type: unknown/);
		await assert.rejects(
			dataStoreRegistryFromIterable([])("unknown"),
			/Unknown data store type: unknown/,
		);
	});

	it("requires an exact type identifier instead of resolving aliases", async () => {
		const kind = makeStubDataStoreKind("https://graph.microsoft.com/types/map");
		const registry = dataStoreRegistryFromIterable([kind]);
		await assert.rejects(registry("map"), /Unknown data store type: map/);
		assert.equal(await registry(kind.type), kind);
	});

	it("rejects mismatched lazy kinds without loading them again", async () => {
		const kind = makeStubDataStoreKind("actual");
		let calls = 0;
		const registry = dataStoreRegistryFromIterable([
			{
				type: "expected",
				kind: async () => {
					calls++;
					return kind;
				},
			},
		]);
		for (let i = 0; i < 2; i++) {
			await assert.rejects(
				registry("expected"),
				/Mismatched data store type. Expected: expected, got: actual/,
			);
		}
		assert.equal(calls, 1);
	});
});
