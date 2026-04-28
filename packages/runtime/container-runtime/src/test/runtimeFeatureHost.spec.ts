/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { RuntimeFeatureHostImpl } from "../runtimeFeatureHost.js";

describe("RuntimeFeatureHost", () => {
	it("invokes once-callbacks in registration order", async () => {
		const host = new RuntimeFeatureHostImpl();
		const calls: string[] = [];
		host.once("ready", () => {
			calls.push("a");
		});
		host.once("ready", () => {
			calls.push("b");
		});
		host.once("ready", () => {
			calls.push("c");
		});
		await host.runPhase("ready");
		assert.deepEqual(calls, ["a", "b", "c"]);
	});

	it("awaits async once-callbacks", async () => {
		const host = new RuntimeFeatureHostImpl();
		const order: string[] = [];
		host.once("loadFromSnapshot", async () => {
			await new Promise<void>((resolve) => setTimeout(resolve, 5));
			order.push("first");
		});
		host.once("loadFromSnapshot", () => {
			order.push("second");
		});
		await host.runPhase("loadFromSnapshot");
		assert.deepEqual(order, ["first", "second"]);
	});

	it("supports phases with no registered callbacks", async () => {
		const host = new RuntimeFeatureHostImpl();
		// Should not throw.
		await host.runPhase("ready");
		await host.runPhase("connect");
	});

	it("throws when registering once for a phase that already fired", async () => {
		const host = new RuntimeFeatureHostImpl();
		await host.runPhase("ready");
		assert.throws(
			() => host.once("ready", () => {}),
			/already fired/,
			"registering for a fired one-shot phase should throw",
		);
	});

	it("throws when running a one-shot phase a second time", async () => {
		const host = new RuntimeFeatureHostImpl();
		await host.runPhase("dispose");
		await assert.rejects(host.runPhase("dispose"), /already fired/);
	});

	it("allows on-callbacks for connect/disconnect to fire repeatedly", async () => {
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

	it("allows on-callbacks to be added after a repeating phase has fired", async () => {
		const host = new RuntimeFeatureHostImpl();
		let firstCount = 0;
		let secondCount = 0;
		host.on("connect", () => {
			firstCount++;
		});
		await host.runPhase("connect");
		// Adding later is fine for repeating phases — fires on next invocation.
		host.on("connect", () => {
			secondCount++;
		});
		await host.runPhase("connect");
		assert.equal(firstCount, 2);
		assert.equal(secondCount, 1);
	});

	it("runs all callbacks even if one throws, then rethrows the first error", async () => {
		const host = new RuntimeFeatureHostImpl();
		const calls: string[] = [];
		host.once("dispose", () => {
			calls.push("a");
		});
		host.once("dispose", () => {
			calls.push("b");
			throw new Error("first");
		});
		host.once("dispose", () => {
			calls.push("c");
			throw new Error("second");
		});
		host.once("dispose", () => {
			calls.push("d");
		});
		await assert.rejects(host.runPhase("dispose"), /first/);
		assert.deepEqual(calls, ["a", "b", "c", "d"]);
	});
});
