/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { dataStoreRegistryFromIterable } from "../dataStoreKind.js";
import { makeStubDataStoreKind } from "../stubSharedObject.js";

describe("dataStoreRegistryFromIterable", () => {
	it("loads lazy kinds only when requested, once for concurrent requests", async () => {
		const kind = makeStubDataStoreKind("lazy");
		let loads = 0;
		const registry = dataStoreRegistryFromIterable([
			{
				type: kind.type,
				async kind() {
					loads++;
					return kind;
				},
			},
		]);
		assert.equal(loads, 0);
		const values = await Promise.all([registry(kind.type), registry(kind.type)]);
		assert.deepEqual(values, [kind, kind]);
		assert.equal(loads, 1);
	});

	it("rejects duplicate and unknown identifiers", async () => {
		const kind = makeStubDataStoreKind("duplicate");
		assert.throws(
			() => dataStoreRegistryFromIterable([kind, kind]),
			/Duplicate data store type/,
		);
		await assert.rejects(
			dataStoreRegistryFromIterable([kind])("unknown"),
			/Unknown data store type/,
		);
	});

	it("rejects a lazy loader returning the wrong type", async () => {
		const registry = dataStoreRegistryFromIterable([
			{
				type: "expected",
				kind: async () => makeStubDataStoreKind("other"),
			},
		]);
		await assert.rejects(registry("expected"), /Mismatched data store type/);
	});

	it("does not turn a rejected lazy load into a successful fallback", async () => {
		const error = new Error("load failed");
		let loads = 0;
		const registry = dataStoreRegistryFromIterable([
			{
				type: "failing",
				async kind() {
					loads++;
					throw error;
				},
			},
		]);
		await assert.rejects(registry("failing"), (failure) => failure === error);
		await assert.rejects(registry("failing"), (failure) => failure === error);
		assert.equal(loads, 1);
	});
});
