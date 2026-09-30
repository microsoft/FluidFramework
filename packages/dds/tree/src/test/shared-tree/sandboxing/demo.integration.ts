/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { disposeActiveSessions, setup } from "./sandboxingTestUtils.js";

describe("Host and Guest Demo", () => {
	afterEach(function () {
		disposeActiveSessions(this.currentTest?.state === "failed");
	});

	it("the initial state is consistent across the Host and Guest", async () => {
		const { host, guest } = await setup(["A"]);
		assert.deepEqual([...guest.view.root], ["A"]);
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...host.main.root], ["A"]);
	});

	it("one Guest edit", async () => {
		const { peer, host, guest, provider } = await setup([]);

		// Edit in the Guest.
		guest.view.root.push("B(g)");
		// The edit is synchronously reflected in the Guest.
		assert.deepEqual([...guest.view.root], ["B(g)"]);
		// The edit is not reflected in the Host yet.
		assert.deepEqual([...host.local.root], []);
		assert.deepEqual([...host.main.root], []);

		// The Guest should have started to push the edit to the Host.
		const pushPromise =
			guest.updateHostPromise ?? assert.fail("Expected push to be in progress");
		// Wait for the edit to be pushed to the Host.
		await pushPromise;

		// The edit is now reflected in the Host.
		assert.deepEqual([...host.local.root], ["B(g)"]);
		assert.deepEqual([...host.main.root], ["B(g)"]);
		// The edit is not reflected in the peer yet.
		assert.deepEqual([...peer.root], []);

		provider.synchronizeMessages();
		// The edit is now reflected in the peer.
		assert.deepEqual([...peer.root], ["B(g)"]);
	});

	it("new Guest edits during Guest edit push", async () => {
		const { peer, host, guest, provider } = await setup([]);

		// Edit in the Guest.
		guest.view.root.push("B(g)");
		const pushPromise =
			guest.updateHostPromise ?? assert.fail("Expected push to be in progress");

		// Before the push completes, make more edits in the Guest.
		guest.view.root.push("C(g)");
		guest.view.root.push("D(g)");
		// The new edits are synchronously reflected in the Guest.
		assert.deepEqual([...guest.view.root], ["B(g)", "C(g)", "D(g)"]);
		// The new edits are not reflected in the Host yet.
		assert.deepEqual([...host.local.root], []);
		assert.deepEqual([...host.main.root], []);

		await pushPromise;
		// The edits are now reflected in the Host.
		assert.deepEqual([...host.local.root], ["B(g)", "C(g)", "D(g)"]);
		assert.deepEqual([...host.main.root], ["B(g)", "C(g)", "D(g)"]);
		// The edits are not reflected in the peer yet.
		assert.deepEqual([...peer.root], []);

		provider.synchronizeMessages();
		// The edits are now reflected in the peer.
		assert.deepEqual([...peer.root], ["B(g)", "C(g)", "D(g)"]);
	});

	it("concurrent Guest, Host, and peer edits converge", async () => {
		const { peer, host, guest, provider } = await setup([]);

		// Each participant edits independently before any synchronization completes.
		guest.view.root.push("Guest");
		const pushPromise =
			guest.updateHostPromise ?? assert.fail("Expected push to be in progress");
		host.main.root.push("Host");
		peer.root.push("Peer");

		assert.deepEqual([...guest.view.root], ["Guest"]);
		assert.deepEqual([...host.main.root], ["Host"]);
		assert.deepEqual([...peer.root], ["Peer"]);

		// Sequence the Host and peer edits while the Guest edit is still being pushed.
		provider.synchronizeMessages();
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");
		assert.equal(guest.updateHostPromise, pushPromise);

		// Full-duplex synchronization processes both directions concurrently.
		await Promise.all([pushPromise, updatePromise]);

		// Sequence the Guest edit and wait for the resulting Host update.
		provider.synchronizeMessages();
		await host.updateGuestPromise;

		// The provider flushes immediately, so Host is submitted before Peer.
		// Guest crosses the asynchronous sandbox channel and is submitted last.
		// Concurrent inserts at the same position end up in reverse sequencing order.
		const expected = ["Guest", "Peer", "Host"];
		assert.deepEqual([...guest.view.root], expected);
		assert.deepEqual([...host.local.root], expected);
		assert.deepEqual([...host.main.root], expected);
		assert.deepEqual([...peer.root], expected);
	});

	it("one peer edit", async () => {
		const { peer, host, guest, provider } = await setup([]);

		// Edit on the peer.
		peer.root.push("B(p)");
		// The edit is synchronously reflected in the peer.
		assert.deepEqual([...peer.root], ["B(p)"]);
		// The edit is not reflected in the Host or the Guest yet.
		assert.deepEqual([...host.local.root], []);
		assert.deepEqual([...host.main.root], []);
		assert.deepEqual([...guest.view.root], []);

		provider.synchronizeMessages();
		// The edit is now reflected in the Host but not in the local branch or Guest.
		assert.deepEqual([...host.main.root], ["B(p)"]);
		assert.deepEqual([...host.local.root], []);
		assert.deepEqual([...guest.view.root], []);

		// The Host should have started to update the Guest with the peer change.
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");
		// Wait for the update to be applied to the Guest.
		await updatePromise;

		// The peer edit is now reflected in the local branch and Guest.
		assert.deepEqual([...host.local.root], ["B(p)"]);
		assert.deepEqual([...guest.view.root], ["B(p)"]);
	});

	it("new peer edits during Guest update", async () => {
		const { peer, host, guest, provider } = await setup([]);

		// Edit on the peer.
		peer.root.push("B(p)");
		provider.synchronizeMessages();
		// The new peer edit is reflected in the Host but not in the local branch or Guest.
		assert.deepEqual([...host.main.root], ["B(p)"]);
		assert.deepEqual([...host.local.root], []);
		assert.deepEqual([...guest.view.root], []);

		// The Host should have started to update the Guest with the peer change.
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");

		// Before the update is applied to the Guest, more edits arrive from the peer.
		peer.root.push("C(p)");
		peer.root.push("D(p)");
		provider.synchronizeMessages();
		// The new peer edits are reflected in the Host but not in the local branch or Guest.
		assert.deepEqual([...host.main.root], ["B(p)", "C(p)", "D(p)"]);
		assert.deepEqual([...host.local.root], []);
		assert.deepEqual([...guest.view.root], []);

		await updatePromise;
		// After the promise resolves, all peer edits are reflected in the local branch and Guest.
		assert.deepEqual([...host.local.root], ["B(p)", "C(p)", "D(p)"]);
		assert.deepEqual([...guest.view.root], ["B(p)", "C(p)", "D(p)"]);
	});
});
