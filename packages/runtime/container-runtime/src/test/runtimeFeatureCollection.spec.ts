/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ContainerMessageType } from "../messageTypes.js";
import type { IRuntimeFeature } from "../runtimeFeature.js";
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

	it("dispatches setConnectionState to features", () => {
		const events: { canSendOps: boolean; clientId: string | undefined }[] = [];
		const collection = new RuntimeFeatureCollection();
		const feature: IRuntimeFeature = {
			setConnectionState: (canSendOps, clientId) => {
				events.push({ canSendOps, clientId });
			},
		};
		collection.add(feature);
		collection.setConnectionState(true, "client-1");
		collection.setConnectionState(false, undefined);
		collection.setConnectionState(true, "client-2");
		assert.deepEqual(events, [
			{ canSendOps: true, clientId: "client-1" },
			{ canSendOps: false, clientId: undefined },
			{ canSendOps: true, clientId: "client-2" },
		]);
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

	it("collection exposes every dispatch method", () => {
		const collection = new RuntimeFeatureCollection();
		assert.equal(typeof collection.onLoadFromSnapshot, "function");
		assert.equal(typeof collection.setConnectionState, "function");
		assert.equal(typeof collection.dispose, "function");
		assert.equal(typeof collection.contributeSummary, "function");
		assert.equal(typeof collection.handleOp, "function");
	});

	it("handleOp routes by op type via the supportedOps map", () => {
		const seen: string[] = [];
		const collection = new RuntimeFeatureCollection();
		collection.add({
			supportedOps: [ContainerMessageType.FluidDataStoreOp],
			handleOp: () => {
				seen.push("a");
			},
		});
		collection.add({
			supportedOps: [ContainerMessageType.GC],
			handleOp: () => {
				seen.push("b");
			},
		});

		const m = (
			type: ContainerMessageType,
		): Parameters<RuntimeFeatureCollection["handleOp"]>[0] =>
			({ type }) as unknown as Parameters<RuntimeFeatureCollection["handleOp"]>[0];

		assert.equal(
			collection.handleOp(m(ContainerMessageType.FluidDataStoreOp), [], false),
			true,
		);
		assert.deepEqual(seen, ["a"]);

		seen.length = 0;
		assert.equal(collection.handleOp(m(ContainerMessageType.GC), [], false), true);
		assert.deepEqual(seen, ["b"]);

		seen.length = 0;
		assert.equal(collection.handleOp(m(ContainerMessageType.Rejoin), [], false), false);
		assert.deepEqual(seen, []); // no claim, no feature called
	});

	it("rejects multiple features claiming the same (type, hook)", () => {
		const collection = new RuntimeFeatureCollection();
		collection.add({
			supportedOps: [ContainerMessageType.GC],
			handleOp: () => {},
		});
		assert.throws(() =>
			collection.add({
				supportedOps: [ContainerMessageType.GC],
				handleOp: () => {},
			}),
		);
	});

	it("contributeSummary fans out to features that mutate the same tree", () => {
		const tree = {} as unknown as Parameters<RuntimeFeatureCollection["contributeSummary"]>[0];
		const seen: string[] = [];
		const collection = new RuntimeFeatureCollection();
		collection.add({
			contributeSummary: (st) => {
				assert.equal(st, tree);
				seen.push("a");
			},
		});
		collection.add({
			contributeSummary: (st) => {
				assert.equal(st, tree);
				seen.push("b");
			},
		});
		collection.contributeSummary(tree, false, false);
		assert.deepEqual(seen, ["a", "b"]);
	});
});
