/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";

import { disposeActiveSessions, setup } from "./sandboxingTestUtils.js";

describe("Host and Guest Demo", () => {
	afterEach(function () {
		disposeActiveSessions(this.currentTest?.state === "failed");
	});

	it("the initial state is consistent across the Host and Guest", () => {
		const { host, guest } = setup(["A"]);
		strict.deepEqual([...guest.view.root], ["A"]);
		strict.deepEqual([...host.local.root], ["A"]);
		strict.deepEqual([...host.main.root], ["A"]);
	});

	it("one Guest edit", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Edit in the Guest.
		guest.view.root.push("B(g)");
		// The edit is synchronously reflected in the Guest.
		strict.deepEqual([...guest.view.root], ["B(g)"]);
		// The edit is not reflected in the Host yet.
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The Guest should have started to push the edit to the Host.
		const pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		// Wait for the edit to be pushed to the Host.
		await pushPromise;

		// The edit is now reflected in the Host.
		strict.deepEqual([...host.local.root], ["B(g)"]);
		strict.deepEqual([...host.main.root], ["B(g)"]);
		// The edit is not reflected in the peer yet.
		strict.deepEqual([...peer.root], []);

		provider.synchronizeMessages();
		// The edit is now reflected in the peer.
		strict.deepEqual([...peer.root], ["B(g)"]);
	});

	it("new Guest edits during Guest edit push", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Edit in the Guest.
		guest.view.root.push("B(g)");
		const pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");

		// Before the push completes, make more edits in the Guest.
		guest.view.root.push("C(g)");
		guest.view.root.push("D(g)");
		// The new edits are synchronously reflected in the Guest.
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)", "D(g)"]);
		// The new edits are not reflected in the Host yet.
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		await pushPromise;
		// The edits are now reflected in the Host.
		strict.deepEqual([...host.local.root], ["B(g)", "C(g)", "D(g)"]);
		strict.deepEqual([...host.main.root], ["B(g)", "C(g)", "D(g)"]);
		// The edits are not reflected in the peer yet.
		strict.deepEqual([...peer.root], []);

		provider.synchronizeMessages();
		// The edits are now reflected in the peer.
		strict.deepEqual([...peer.root], ["B(g)", "C(g)", "D(g)"]);
	});

	it("one peer edit", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Edit on the peer.
		peer.root.push("B(p)");
		// The edit is synchronously reflected in the peer.
		strict.deepEqual([...peer.root], ["B(p)"]);
		// The edit is not reflected in the Host or the Guest yet.
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);
		strict.deepEqual([...guest.view.root], []);

		provider.synchronizeMessages();
		// The edit is now reflected in the Host but not in the local branch or Guest.
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		// The Host should have started to update the Guest with the peer change.
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");
		// Wait for the update to be applied to the Guest.
		await updatePromise;

		// The peer edit is now reflected in the local branch and Guest.
		strict.deepEqual([...host.local.root], ["B(p)"]);
		strict.deepEqual([...guest.view.root], ["B(p)"]);
	});

	it("new peer edits during Guest update", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Edit on the peer.
		peer.root.push("B(p)");
		provider.synchronizeMessages();
		// The new peer edit is reflected in the Host but not in the local branch or Guest.
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		// The Host should have started to update the Guest with the peer change.
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		// Before the update is applied to the Guest, more edits arrive from the peer.
		peer.root.push("C(p)");
		peer.root.push("D(p)");
		provider.synchronizeMessages();
		// The new peer edits are reflected in the Host but not in the local branch or Guest.
		strict.deepEqual([...host.main.root], ["B(p)", "C(p)", "D(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		await updatePromise;
		// After the promise resolves, all peer edits are reflected in the local branch and Guest.
		strict.deepEqual([...host.local.root], ["B(p)", "C(p)", "D(p)"]);
		strict.deepEqual([...guest.view.root], ["B(p)", "C(p)", "D(p)"]);
	});
});
