/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { RuntimeFeatureHostImpl } from "../runtimeFeatureHost.js";

describe("RuntimeFeatureHost", () => {
	it("invokes callbacks in registration order", async () => {
		const host = new RuntimeFeatureHostImpl();
		const calls: string[] = [];
		host.on("ready", () => {
			calls.push("a");
		});
		host.on("ready", () => {
			calls.push("b");
		});
		host.on("ready", () => {
			calls.push("c");
		});
		await host.runPhase("ready");
		assert.deepEqual(calls, ["a", "b", "c"]);
	});

	it("awaits async callbacks", async () => {
		const host = new RuntimeFeatureHostImpl();
		const order: string[] = [];
		host.on("loadFromSnapshot", async () => {
			await new Promise<void>((resolve) => setTimeout(resolve, 5));
			order.push("first");
		});
		host.on("loadFromSnapshot", () => {
			order.push("second");
		});
		await host.runPhase("loadFromSnapshot");
		assert.deepEqual(order, ["first", "second"]);
	});

	it("supports phases with no registered callbacks", async () => {
		const host = new RuntimeFeatureHostImpl();
		// Should not throw.
		await host.runPhase("ready");
	});

	it("throws when registering for a one-shot phase that already fired", async () => {
		const host = new RuntimeFeatureHostImpl();
		await host.runPhase("ready");
		assert.throws(
			() => host.on("ready", () => {}),
			/already fired/,
			"registering for a fired one-shot phase should throw",
		);
	});

	it("throws when running a one-shot phase a second time", async () => {
		const host = new RuntimeFeatureHostImpl();
		await host.runPhase("dispose");
		await assert.rejects(host.runPhase("dispose"), /already fired/);
	});

	it("allows connect/disconnect to alternate", async () => {
		const host = new RuntimeFeatureHostImpl();
		let connectCount = 0;
		let disconnectCount = 0;
		host.on("connect", () => {
			connectCount++;
		});
		host.on("disconnect", () => {
			disconnectCount++;
		});
		await host.runPhase("connect");
		await host.runPhase("disconnect");
		await host.runPhase("connect");
		await host.runPhase("disconnect");
		assert.equal(connectCount, 2);
		assert.equal(disconnectCount, 2);
	});

	it("runs all callbacks even if one throws, then rethrows the first error", async () => {
		const host = new RuntimeFeatureHostImpl();
		const calls: string[] = [];
		host.on("dispose", () => {
			calls.push("a");
		});
		host.on("dispose", () => {
			calls.push("b");
			throw new Error("first");
		});
		host.on("dispose", () => {
			calls.push("c");
			throw new Error("second");
		});
		host.on("dispose", () => {
			calls.push("d");
		});
		await assert.rejects(host.runPhase("dispose"), /first/);
		assert.deepEqual(calls, ["a", "b", "c", "d"]);
	});
});
