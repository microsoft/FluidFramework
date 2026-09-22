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

		guest.view.root.push("B(g)");
		strict.deepEqual([...guest.view.root], ["B(g)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		const pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...host.local.root], ["B(g)"]);
		strict.deepEqual([...host.main.root], ["B(g)"]);
		strict.deepEqual([...peer.root], []);

		provider.synchronizeMessages();
		strict.deepEqual([...peer.root], ["B(g)"]);
	});

	it("new Guest edits during Guest edit push", async () => {
		const { peer, host, guest, provider } = setup([]);

		guest.view.root.push("B(g)");
		const pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");

		guest.view.root.push("C(g)");
		guest.view.root.push("D(g)");
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)", "D(g)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		await pushPromise;
		strict.deepEqual([...host.local.root], ["B(g)", "C(g)", "D(g)"]);
		strict.deepEqual([...host.main.root], ["B(g)", "C(g)", "D(g)"]);
		strict.deepEqual([...peer.root], []);

		provider.synchronizeMessages();
		strict.deepEqual([...peer.root], ["B(g)", "C(g)", "D(g)"]);
	});

	it("one peer edit", async () => {
		const { peer, host, guest, provider } = setup([]);

		peer.root.push("B(p)");
		strict.deepEqual([...peer.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);
		strict.deepEqual([...guest.view.root], []);

		provider.synchronizeMessages();
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");
		await updatePromise;

		strict.deepEqual([...host.local.root], ["B(p)"]);
		strict.deepEqual([...guest.view.root], ["B(p)"]);
	});

	it("new peer edits during Guest update", async () => {
		const { peer, host, guest, provider } = setup([]);

		peer.root.push("B(p)");
		provider.synchronizeMessages();
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		peer.root.push("C(p)");
		peer.root.push("D(p)");
		provider.synchronizeMessages();
		strict.deepEqual([...host.main.root], ["B(p)", "C(p)", "D(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		await updatePromise;
		strict.deepEqual([...host.local.root], ["B(p)", "C(p)", "D(p)"]);
		strict.deepEqual([...guest.view.root], ["B(p)", "C(p)", "D(p)"]);
	});
});
