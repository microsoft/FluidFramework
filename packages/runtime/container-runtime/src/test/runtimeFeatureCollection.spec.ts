/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IRuntimeFeature } from "@fluidframework/runtime-definitions/internal";

import { RuntimeFeatureCollection } from "../runtimeFeatureCollection.js";

describe("RuntimeFeatureCollection", () => {
	it("dispatches onLoadFromSnapshot to features in registration order", async () => {
		const calls: string[] = [];
		const collection = new RuntimeFeatureCollection();
		collection.add({
			onLoadFromSnapshot: async () => {
				calls.push("a");
			},
		});
		collection.add({
			onLoadFromSnapshot: async () => {
				calls.push("b");
			},
		});
		collection.add({
			onLoadFromSnapshot: async () => {
				calls.push("c");
			},
		});
		await collection.onLoadFromSnapshot();
		assert.deepEqual(calls, ["a", "b", "c"]);
	});

	it("skips features that don't implement a phase", async () => {
		const calls: string[] = [];
		const collection = new RuntimeFeatureCollection();
		collection.add({
			onLoadFromSnapshot: async () => {
				calls.push("a");
			},
		});
		collection.add({}); // no methods — should be skipped silently
		collection.add({
			onLoadFromSnapshot: async () => {
				calls.push("c");
			},
		});
		await collection.onLoadFromSnapshot();
		assert.deepEqual(calls, ["a", "c"]);
	});

	it("awaits async lifecycle methods", async () => {
		const order: string[] = [];
		const collection = new RuntimeFeatureCollection();
		collection.add({
			onLoadFromSnapshot: async () => {
				await new Promise<void>((resolve) => setTimeout(resolve, 5));
				order.push("first");
			},
		});
		collection.add({
			onLoadFromSnapshot: async () => {
				order.push("second");
			},
		});
		await collection.onLoadFromSnapshot();
		assert.deepEqual(order, ["first", "second"]);
	});

	it("dispatches sync methods", () => {
		const connects: string[] = [];
		const disconnects: number[] = [];
		const collection = new RuntimeFeatureCollection();
		const feature: IRuntimeFeature = {
			onConnect: (clientId) => {
				connects.push(clientId);
			},
			onDisconnect: () => {
				disconnects.push(disconnects.length);
			},
		};
		collection.add(feature);
		collection.onConnect("client-1");
		collection.onDisconnect();
		collection.onConnect("client-2");
		collection.onDisconnect();
		assert.deepEqual(connects, ["client-1", "client-2"]);
		assert.equal(disconnects.length, 2);
	});

	it("dispose calls every feature's dispose", () => {
		const disposed: string[] = [];
		const collection = new RuntimeFeatureCollection();
		collection.add({
			dispose: () => {
				disposed.push("a");
			},
		});
		collection.add({
			dispose: () => {
				disposed.push("b");
			},
		});
		collection.dispose();
		assert.deepEqual(disposed, ["a", "b"]);
	});

	it("collection itself satisfies Required<IRuntimeFeature>", () => {
		// Compile-time: the collection has every method on the interface, non-optional.
		const collection: Required<IRuntimeFeature> = new RuntimeFeatureCollection();
		assert.equal(typeof collection.onLoadFromSnapshot, "function");
		assert.equal(typeof collection.onApplyStashedOps, "function");
		assert.equal(typeof collection.onReady, "function");
		assert.equal(typeof collection.onConnect, "function");
		assert.equal(typeof collection.onDisconnect, "function");
		assert.equal(typeof collection.dispose, "function");
	});
});
